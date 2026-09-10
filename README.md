# HTW-Stundenplan als Kalender-Abo

Im HTW-LSF lässt sich der persönliche Stundenplan ansehen, aber nicht exportieren. Die
Vorlesungspläne selbst sind jedoch **öffentlich**, inklusive Ausfällen und Raumänderungen.

Dieser Cloudflare Worker liest sie aus und macht daraus einen `webcal://`-Link, den man
einmal in Google/Apple/Outlook Calendar abonniert und der danach von selbst aktuell bleibt.

```
Studiengang wählen → Fachsemester → Gruppe → Kurse abhaken → Link kopieren → fertig
```

Vor der Auswahl steht eine Erklärseite. Sie benennt, was man sonst erst schmerzhaft
herausfindet: wie aktuell der Kalender wirklich ist, was beim Semesterwechsel mit
den alten Terminen passiert, und dass der Link den Stundenplan im Klartext enthält. Die
Bestätigung wird lokal gemerkt, bleibt aber über „Hinweise nochmal lesen“ erreichbar.

## Loslegen

```bash
pnpm install
pnpm test                                   # 166 Tests, komplett offline gegen Fixtures
echo "CRAWL_TOKEN=$(openssl rand -hex 16)" > .dev.vars
pnpm dev                                    # http://localhost:8787
```

Für den Betrieb in der Cloud:

```bash
npx wrangler kv namespace create CAL        # ID in wrangler.jsonc eintragen
npx wrangler secret put CRAWL_TOKEN
npx wrangler deploy
npx wrangler types                          # erzeugt worker-configuration.d.ts
```

Wer den Dienst öffentlich betreibt, ist selbst der Anbieter im Sinne von § 5 DDG und trägt
sich dafür ein:

```bash
npx wrangler secret put OPERATOR_NAME
npx wrangler secret put OPERATOR_STREET
npx wrangler secret put OPERATOR_CITY
npx wrangler secret put OPERATOR_EMAIL
```

Diese Angaben stehen bewusst nicht im Code. Sonst trüge jeder Fork das Impressum des
ursprünglichen Autors, und das Rechenzentrum bekäme bei einer Rückfrage zum Crawler dessen
Adresse statt der des tatsächlichen Betreibers. Solange sie fehlen, sagen `/impressum` und
`/datenschutz` das offen und nennen die fehlenden Namen. Der Crawler lässt die Kontaktadresse
im User-Agent dann weg, statt eine fremde zu nennen.

Danach `PUBLIC_ORIGIN` und den `services`-Eintrag in `wrangler.jsonc` auf die echte URL bzw.
den echten Worker-Namen setzen. **`PUBLIC_ORIGIN` darf sich später nicht mehr ändern.**
Die Kalender-UIDs hängen daran, und ein Wechsel würde in jedem abonnierten Kalender sämtliche
Termine verdoppeln.

## Wie es funktioniert

| Route | Zweck |
|---|---|
| `/` | Auswahl-Oberfläche, erzeugt den Abo-Link, erklärt das Abonnieren in Google Kalender, Apple Kalender und Outlook |
| `/feed/htw.ics` | der Kalender selbst |
| `/api/programs`, `/api/courses` | Daten für die Oberfläche, ausschließlich aus KV |
| `/health` | pro Kohorte: Semester, Termine, Alter, Fehler |
| `/impressum`, `/datenschutz` | Rechtstexte |
| `/__crawl`, `/__parse` | intern, per `X-Crawl-Token` geschützt |

Die internen Endpunkte werden über ein **Service-Binding auf den Worker selbst** aufgerufen
(`env.SELF`), nicht per HTTP auf die eigene Hostname. Letzteres lehnt Cloudflare mit
Fehler 1042 ab.

**Keine Anfrage eines Abonnenten erreicht jemals das LSF.** Der Cron holt die Daten viermal
täglich und legt sie in KV ab; die LSF-Last hängt an der Zahl der *Kohorten*
(Studiengang + Fachsemester), nicht an der Zahl der Abonnenten.

Ist ein Snapshot beim Abruf älter als zwei Stunden, stößt der Feed zusätzlich im Hintergrund
eine Aktualisierung an. Ausgeliefert wird sofort der vorhandene Stand, der nächste Abruf
bekommt den frischen. Das ist in KV auf einmal pro halbe Stunde und Kohorte gedrosselt.

### Warum die Wochenansicht und nicht die Listenansicht

Die Listenansicht liefert Regeln der Form „mittwochs 08:00, wöchentlich vom 07.10. bis
10.02.", und die sind **falsch**, sobald Ferien dazwischenliegen. Die Wochenansicht bildet
den akademischen Kalender dagegen tagesgenau ab.

Der Crawler rechnet die Regeln trotzdem aus und vergleicht sie mit dem Raster. Die Differenz
steht als `ruleDelta` im Snapshot und sollte genau die vorlesungsfreien Tage sein. Für
Angewandte Informatik im WS 2026/27 ist das:

```
2026-12-23  2026-12-24  2026-12-28  2026-12-29  2026-12-30  2026-12-31
```

Springt dieser Wert plötzlich, ist entweder der Rasterparser kaputt oder LSF hat sein HTML
geändert. Ein Drift-Alarm, der praktisch nichts kostet.

### Warum jedes Dokument seine eigene Invocation bekommt

Ein 110 KB großes Wochenraster zu parsen kostet ~3,5 ms. Der Cloudflare-Free-Tarif gibt
**10 ms CPU pro Invocation**. Ein Crawl, der zwanzig Wochen am Stück parst, würde also
abgeschnitten. Deshalb holt `/__crawl` jedes Dokument über einen Self-Fetch auf `/__parse`:
jedes bekommt sein eigenes Budget, und der Orchestrator sieht nur noch kleines JSON. Am Ende
steht **ein** KV-Write. Das umgeht zugleich das Limit von einem Write pro Sekunde und Key,
an das ein paralleler Fan-out laufen würde.

## Die reverse-engineerte LSF-Schnittstelle

Basis: `https://lsf.htw-berlin.de/qisserver/rds`. Alles öffentlich, ohne Login, ohne Session,
ohne Cookies. `text/html; charset=UTF-8`. Software: HIS-LSF (QISserver).
Alle Parameter stehen gesammelt in [`src/lsf/urls.ts`](src/lsf/urls.ts).

| Zweck | Parameter |
|---|---|
| Studiengang-Katalog | `state=change&type=5&moduleParameter=abstgvSearch&…&k_abstgv.dtxt=&search_Studiengang=Auswahl` |
| Listenansicht | `state=wplan&k_abstgv.abstgvnr=<id>&r_zuordabstgv.semvonint=<n>&r_zuordabstgv.sembisint=<n>&act=stg&pool=stg&show=liste&P.vx=lang` |
| Wochenraster | wie oben, aber `show=plan&week=<KW>_<Jahr>` |
| Kursdetail | `state=verpublish&status=init&vmfile=no&publishid=<id>&moduleCall=webInfo&publishConfFile=webInfo&publishSubDir=veranstaltung` |

IDs: `350` = Game Design (B), `346` = System Design/Game Design (M), `345` = Angewandte
Informatik (B).

### Fallstricke, die je einen Test haben

1. **Eine Woche ohne Plandaten scheitert still.** `week=41_2027` liefert HTTP 200 mit elf
   Kurszellen und **null** Datumsköpfen. Ohne Prüfung landen Termine auf erfundenen Tagen.
   → `parseGrid` verlangt fünf aufeinanderfolgende Mo-Fr-Daten, deren KW zur Anfrage passt.
2. **`week=` wirkt nur im Raster.** Die Listenansicht rendert immer das laufende Semester;
   `P.Semester=` ändert nichts. Der Feed braucht deshalb keinen Semester-Parameter.
3. **Eine Rasterzelle kann bis zu zehn Kurse stapeln.** Die CSS-Klasse der Zelle beschreibt
   nur den ersten davon. Der Rhythmus muss aus dem `(…)`-Text jedes Eintrags kommen.
4. **Block-Termine haben `keine Angabe` als Wochentag.** Wer solche Zeilen verwirft, verliert
   die gesamte Prüfungsphase *und* verkürzt den Crawl-Bereich.
5. **Gruppennamen folgen drei Konventionen gleichzeitig**: `1. Zug`, `1. Zug, 2. Gruppe`,
   `Gruppe A`, dazu `Termin` für Veranstaltungen ohne Gruppenbindung. Ein Zug×Gruppe-Raster
   greift zu kurz; `groupSlug` extrahiert stattdessen die Gruppenmarker.
6. **Die Legende oben im Raster nutzt dieselben Klassen `plan5/6/7` wie Terminzellen.**
   Eine Terminzelle wird deshalb daran erkannt, dass sie einen `publishid`-Link enthält.
7. **Räume sind nicht überall gepflegt.** Game Design hat keine, Angewandte Informatik schon.

## Wenn etwas schiefgeht

- Ein fehlgeschlagener Crawl überschreibt **nie** einen guten Snapshot. Bleibt die Antwort
  unplausibel, bleibt der alte Stand stehen und wird weiter ausgeliefert. Der Kalender
  übersteht damit einen LSF-Ausfall.
- Ist der Stand älter als 72 Stunden, erscheint im Kalender ein Ganztagestermin
  „⚠️ HTW-Stundenplan-Feed veraltet“. Besser, man erfährt es, als still eine Raumänderung zu
  verpassen.
- Beim Semesterwechsel wechseln alle `publishid`. Der Snapshot merkt sich das Semester-Label
  und setzt bei einer Änderung komplett zurück. Solange LSF das Label schon umgestellt, die
  Raster aber noch nicht gefüllt hat, bleibt der alte Stand stehen.
- `?roll=1` zählt das Fachsemester automatisch hoch, abgeleitet vom Semester des Snapshots
  statt von der Wanduhr. Der Kalender springt also genau dann, wenn LSF springt.
- Innerhalb eines Semesters wird nichts nach Datum aussortiert: bereits vergangene Termine
  bleiben im Feed. Beim Semesterwechsel verschwindet das abgelaufene Semester dagegen
  vollständig. Alle `publishid` werden neu vergeben, ein Vermischen zweier Semester wäre
  nicht sinnvoll diffbar. Wer das alte Semester behalten will, lädt es vor dem Wechsel über
  „Einmalig herunterladen“ als statische Datei herunter.
- Gruppennamen sind über Semester hinweg **nicht** stabil. Passt keine der gespeicherten
  Gruppen mehr zum aktuellen Snapshot, wird der Gruppenfilter ignoriert statt angewendet: zu
  viel anzuzeigen ist ein sichtbares Problem, zu wenig ein unsichtbares.

## Fixtures und Drift

`pnpm fixtures` lädt alle Testdateien neu. Volatile Teile (Node- und Thread-Namen des
LSF-Loadbalancers) werden dabei normalisiert, damit ein Diff etwas bedeutet. **Der Diff
dieses Laufs ist die Benachrichtigung, dass LSF sein HTML geändert hat.** Am besten wöchentlich
in CI laufen lassen und als PR öffnen.

## Datenschutz

Die Fahrplandaten sind ohnehin öffentlich. Neu ist nur, dass die Feed-URL Studiengang,
Semester, Gruppe und Kursauswahl im Klartext nennt. Deshalb: `X-Robots-Tag: noindex` auf
`/feed/*`, ein `robots.txt`-Disallow, keine Cookies, keine Analytics, keine Drittanfragen.

Der Worker schreibt kein einziges Log, und Cloudflares Observability ist in
`wrangler.jsonc` bewusst abgeschaltet. Sonst würden die Feed-URLs stichprobenartig samt
Studiengang, Semester und Kursauswahl in den Workers Logs landen. Zur Fehlersuche lässt
sie sich vorübergehend einschalten.

Impressum und Datenschutzerklärung liegen unter `/impressum` und `/datenschutz` und sind
aus der Fußzeile verlinkt.

## Gegenüber dem LSF

Der Crawler meldet sich mit einem sprechenden User-Agent samt Kontaktadresse, holt maximal
sechs Dokumente gleichzeitig und läuft viermal täglich. Für eine Kohorte sind das rund 88
Anfragen pro Tag.

---

Ohne Gewähr. Im Zweifel gilt das LSF.
