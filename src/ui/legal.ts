import type { Operator } from '../env.js';

/**
 * Impressum und Datenschutzerklärung. Wie die Picker-Seite inline ausgeliefert, damit der
 * Worker kein Asset-Hosting braucht.
 *
 * Aussehen und Favicon sind bewusst identisch zu `renderPage()` in `page.ts`: der CSS-Block
 * dort ist die Vorlage, hier steht er unverändert, ergänzt um ein paar Regeln für Fließtext.
 */

const FAVICON = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%231f6feb'/%3E%3Crect x='3' y='5' width='10' height='8' rx='1' fill='white'/%3E%3Crect x='3' y='3' width='10' height='3' rx='1' fill='%230b3d91'/%3E%3C/svg%3E">`;

const STYLE = `<style>
:root {
  color-scheme: light dark;
  --bg: #fbfbfa; --fg: #1a1a18; --muted: #6b6b63; --line: #e0e0d8;
  --card: #ffffff; --accent: #1f6feb; --accent-fg: #ffffff; --ok: #1a7f37;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16161a; --fg: #ececea; --muted: #9a9a92; --line: #2e2e34;
    --card: #1e1e24; --accent: #4c8dff; --accent-fg: #0b0b0d; --ok: #3fb950;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 80px; }
h1 { font-size: 1.55rem; margin: 0 0 6px; letter-spacing: -0.01em; }
.sub { color: var(--muted); margin: 0 0 28px; }
fieldset {
  border: 1px solid var(--line); border-radius: 10px; background: var(--card);
  padding: 18px 18px 20px; margin: 0 0 18px;
}
legend { padding: 0 8px; font-weight: 600; font-size: 0.95rem; }
label { display: block; margin: 12px 0 5px; font-weight: 500; font-size: 0.9rem; }
select, input[type=text], input[type=number] {
  width: 100%; padding: 9px 10px; border: 1px solid var(--line); border-radius: 7px;
  background: var(--bg); color: var(--fg); font: inherit;
}
.row { display: flex; gap: 14px; flex-wrap: wrap; }
.row > * { flex: 1 1 200px; }
.check { display: flex; gap: 9px; align-items: flex-start; margin: 7px 0; font-weight: 400; }
.check input { margin-top: 3px; flex: none; }
.check span.meta { color: var(--muted); font-size: 0.85em; }
.list { max-height: 300px; overflow-y: auto; border: 1px solid var(--line);
        border-radius: 7px; padding: 10px 12px; margin-top: 6px; }
button {
  font: inherit; font-weight: 550; padding: 9px 16px; border-radius: 7px;
  border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer;
}
button.primary { background: var(--accent); color: var(--accent-fg); border-color: transparent; }
button:disabled { opacity: 0.5; cursor: default; }
.out { display: none; }
.out.show { display: block; }
code.link {
  display: block; word-break: break-all; background: var(--bg); border: 1px solid var(--line);
  border-radius: 7px; padding: 11px 12px; font-size: 0.82rem; margin: 8px 0 12px;
}
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.status { color: var(--muted); font-size: 0.88rem; margin: 10px 0 0; min-height: 1.4em; }
.status.err { color: #d1242f; }
.note { color: var(--muted); font-size: 0.85rem; margin-top: 22px; }
.note strong { color: var(--fg); }
a { color: var(--accent); }

/* Zwei Ansichten auf einer Seite: Erklärung, dann Auswahl. */
[hidden] { display: none !important; }
.intro h2 {
  font-size: 1rem; margin: 26px 0 8px; letter-spacing: -0.005em;
  display: flex; align-items: baseline; gap: 9px;
}
.intro h2::before {
  content: ""; width: 4px; height: 1em; border-radius: 2px;
  background: var(--accent); flex: none; transform: translateY(1px);
}
.intro p, .intro li { color: var(--fg); }
.intro ul { margin: 6px 0 0; padding-left: 20px; }
.intro li { margin: 5px 0; }
.intro li b { font-weight: 600; }
.intro .steps { counter-reset: s; list-style: none; padding: 0; margin: 8px 0 0; }
.intro .steps li {
  counter-increment: s; position: relative; padding-left: 30px; margin: 8px 0;
}
.intro .steps li::before {
  content: counter(s); position: absolute; left: 0; top: 1px;
  width: 21px; height: 21px; border-radius: 50%; background: var(--accent);
  color: var(--accent-fg); font-size: 0.76rem; font-weight: 650;
  display: grid; place-items: center;
}
.gate { margin: 34px 0 0; padding-top: 22px; border-top: 1px solid var(--line); }
.gate button { padding: 12px 22px; font-size: 1rem; }
.backlink {
  background: none; border: 0; padding: 0; color: var(--muted);
  font-size: 0.85rem; text-decoration: underline; cursor: pointer;
}

/* Ergänzungen für die Rechtsseiten: Fließtext statt Formular. */
.legal h2 {
  font-size: 1.05rem; margin: 32px 0 8px; letter-spacing: -0.005em;
  display: flex; align-items: baseline; gap: 9px;
}
.legal h2::before {
  content: ""; width: 4px; height: 1em; border-radius: 2px;
  background: var(--accent); flex: none; transform: translateY(1px);
}
.legal h3 { font-size: 0.95rem; margin: 22px 0 4px; }
.legal p { margin: 9px 0; }
.legal ul { margin: 9px 0; padding-left: 20px; }
.legal li { margin: 6px 0; }
.legal address { font-style: normal; }
.legal code { font-size: 0.88em; background: var(--card); border: 1px solid var(--line);
              border-radius: 4px; padding: 1px 5px; }
.box {
  border: 1px solid var(--line); border-radius: 10px; background: var(--card);
  padding: 14px 16px; margin: 16px 0;
}
.box p:first-child { margin-top: 0; }
.box p:last-child { margin-bottom: 0; }
.footlinks {
  margin: 44px 0 0; padding-top: 20px; border-top: 1px solid var(--line);
  display: flex; gap: 18px; flex-wrap: wrap; font-size: 0.9rem;
}
/* Kasten für die offenen Platzhalter. Siehe Kommentar im Markup. */
.unset { color: var(--muted); font-style: italic; }
.todo {
  border: 2px solid #d1242f; border-radius: 10px; background: var(--card);
  padding: 14px 16px; margin: 0 0 28px;
}
.todo p:first-child { margin-top: 0; }
.todo p:last-child { margin-bottom: 0; }
.todo b { color: #d1242f; }
</style>`;

/**
 * Vor der Veröffentlichung entfernen. Der Kasten steht bewusst über allem anderen.
 *
 * Zum Entfernen: diese Konstante und ihre beiden Verwendungen löschen, dazu die `.todo`-Regeln
 * im CSS. Sonst ändert sich nichts an den Seiten.
 */
/**
 * Der Anbieterblock. Ohne konfigurierten Betreiber wird die Lücke benannt statt mit
 * Platzhaltern gefüllt, die wie echte Angaben aussehen könnten.
 */
function addressBlock(operator: Operator | null): string {
  if (operator === null) {
    return `<p class="unset">Nicht konfiguriert. Siehe Hinweis oben auf dieser Seite.</p>`;
  }
  return `<address>
${escapeHtml(operator.name)}<br>
${escapeHtml(operator.street)}<br>
${escapeHtml(operator.city)}<br>
Deutschland
</address>
<p>E-Mail: <a href="mailto:${escapeHtml(operator.email)}">${escapeHtml(operator.email)}</a></p>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
}

/**
 * Erscheint, solange die Betreiberangaben fehlen.
 *
 * Ein Impressum muss ständig verfügbar sein. Fehlen die Angaben, darf die Seite das nicht
 * verschweigen, sondern muss sagen, dass diese Instanz nicht für den öffentlichen Betrieb
 * eingerichtet ist. Der Kasten verschwindet von selbst, sobald die Variablen gesetzt sind.
 */
function unconfiguredBox(missing: string[]): string {
  return `<div class="todo">
    <p><b>Diese Instanz ist nicht für den öffentlichen Betrieb konfiguriert.</b> Die Angaben
    zum Betreiber fehlen, damit ist das Impressum unvollständig.</p>
    <p>Wer diesen Dienst betreibt, setzt sie als Secrets:
    ${missing.map((k) => `<code>${k}</code>`).join(', ')}.</p>
  </div>`;
}

const FOOTER = `<div class="footlinks">
  <a href="/">Zurück zur Startseite</a>
  <a href="/impressum">Impressum</a>
  <a href="/datenschutz">Datenschutzerklärung</a>
</div>`;

/** Gemeinsames Gerüst beider Rechtsseiten. */
function shell(title: string, body: string, notice: string): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · HTW Stundenplan als Kalender-Abo</title>
${FAVICON}
${STYLE}
</head>
<body>
<div class="wrap legal">
${notice}
${body}
${FOOTER}
</div>
</body>
</html>`;
}

export function renderImpressum(operator: Operator | null, missing: string[] = []): string {
  return shell(
    'Impressum',
    `<h1>Impressum</h1>
<p class="sub">Angaben nach § 5 DDG.</p>

<h2>Anbieter</h2>
${addressBlock(operator)}
<p>Eine Telefonnummer gibt es für dieses Projekt nicht. Anfragen bitte per E-Mail.</p>

<h2>Was dieses Angebot ist</h2>
<p>Dieses Werkzeug liest die öffentlichen Vorlesungspläne der HTW Berlin aus und macht daraus
einen Kalender zum Abonnieren.</p>
<ul>
  <li>Es ist ein privates Studentenprojekt und wird nicht kommerziell betrieben.</li>
  <li>Die Nutzung ist kostenlos. Es gibt keine Werbung.</li>
  <li>Es gibt kein Nutzerkonto und keine Registrierung.</li>
</ul>

<h2>Keine Verbindung zur HTW Berlin</h2>
<div class="box">
  <p>Dieses Angebot wird <b>nicht von der HTW Berlin betrieben</b>, nicht von ihr beauftragt,
  nicht von ihr unterstützt und nicht von ihr geprüft. Es steht in keiner Verbindung zur
  Hochschule.</p>
  <p>Fragen zu den Inhalten der Vorlesungspläne selbst, etwa zu Terminen, Räumen oder
  Ausfällen, beantwortet nur die HTW Berlin. Fragen zu diesem Werkzeug beantwortet die oben
  genannte E-Mail-Adresse.</p>
</div>

<h2>Herkunft der Daten</h2>
<p>Alle Veranstaltungsdaten stammen unverändert aus den Vorlesungsplänen des HTW-LSF unter
<a href="https://lsf.htw-berlin.de" rel="noopener noreferrer">lsf.htw-berlin.de</a>. Diese
Pläne sind dort öffentlich und ohne Anmeldung abrufbar. Dieses Werkzeug stellt sie nur in
einem anderen Format bereit. Es fügt nichts hinzu und bewertet nichts.</p>

<h2>Gewähr</h2>
<p>Die Pläne werden mehrmals täglich abgeglichen, trotzdem kann der Kalender veraltet oder
unvollständig sein. Wie schnell Änderungen ankommen, hängt zusätzlich von der Kalender-App ab.
Verbindlich ist immer das LSF. Wer einen Fehler findet, darf ihn gerne per E-Mail melden.</p>

<h2>Rechte an den Inhalten</h2>
<p>Die Vorlesungspläne stammen von der HTW Berlin. Rechte daran liegen bei der Hochschule
beziehungsweise den jeweiligen Urhebern. Wer eine Veröffentlichung hier für unzulässig hält,
melde sich bitte per E-Mail. Beanstandete Inhalte werden dann geprüft und, wenn nötig,
entfernt.</p>`,
    operator === null ? unconfiguredBox(missing) : '',
  );
}

export function renderDatenschutz(operator: Operator | null, missing: string[] = []): string {
  return shell(
    'Datenschutzerklärung',
    `<h1>Datenschutzerklärung</h1>
<p class="sub">Stand: September 2026</p>

<div class="box">
  <p><b>Kurz gesagt:</b> Dieses Werkzeug erhebt keine personenbezogenen Daten. Es gibt keine
  Cookies, keine Analyse-Werkzeuge und keine Inhalte von fremden Servern. Auf dem Server
  liegen nur öffentliche Vorlesungspläne, kein Bezug zu einer Person.</p>
  <p>Eines sollten Sie trotzdem wissen: Die erzeugte Abo-Adresse verrät Ihren Stundenplan an
  jeden, der sie kennt. Weiter unten steht genauer, was das bedeutet.</p>
</div>

<h2>Verantwortlicher</h2>
${addressBlock(operator)}
<p>Einen Datenschutzbeauftragten gibt es nicht. Das Projekt ist dafür zu klein, die
Voraussetzungen dafür liegen nicht vor.</p>

<h2>Was beim Aufruf der Seite passiert</h2>
<p>Die Seite wird von Cloudflare Workers ausgeliefert. Damit eine Anfrage überhaupt beantwortet
werden kann, verarbeitet Cloudflare technische Verbindungsdaten, darunter Ihre IP-Adresse, den
Zeitpunkt, die angeforderte Adresse und Angaben Ihres Browsers.</p>
<p>Was dabei <b>nicht</b> passiert:</p>
<ul>
  <li>Es werden keine Cookies gesetzt.</li>
  <li>Es gibt keine Analyse, keine Reichweitenmessung und keine Zählpixel.</li>
  <li>Es werden keine Schriftarten, Skripte, Symbole oder sonstigen Dateien von fremden
    Servern nachgeladen. Die Seite besteht aus einer einzigen Datei. Ihr Browser stellt beim
    Aufruf keine einzige Anfrage an einen dritten Server.</li>
  <li>Es gibt kein Konto, keine Anmeldung und keine Abfrage von E-Mail-Adressen.</li>
  <li>Name, Matrikelnummer oder andere Angaben zu Ihrer Person werden nirgends verarbeitet.
    Das Werkzeug fragt sie nicht ab und braucht sie nicht.</li>
</ul>
<p>Auch das LSF der HTW erfährt nichts über Sie. Die Vorlesungspläne holt der Server selbst
ab, nicht Ihr Browser. Gegenüber dem LSF tritt also nur dieser Dienst auf.</p>
<p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse ist der Betrieb
der Seite: Ohne Verarbeitung der Verbindungsdaten lässt sich keine Webseite ausliefern.</p>

<h2>Protokollierung</h2>
<p>Dieser Dienst schreibt keine Protokolle. Die Protokollfunktion der Plattform, die jede
zehnte Anfrage samt vollständiger Adresse mitgeschnitten hätte, ist bewusst abgeschaltet.
Der Grund: Bei einer Abo-Adresse wäre diese Adresse gleichbedeutend mit der Kombination aus
Studiengang, Fachsemester, Gruppe und abgewählten Kursen. Ein Name steht darin zwar nicht,
je nach Studiengang kann die Kombination aber recht eindeutig sein.</p>
<p>Cloudflare verarbeitet als Betreiber der Plattform weiterhin die technischen
Verbindungsdaten, die jeder Server für die Auslieferung braucht. Darauf hat dieser Dienst
keinen Einfluss, es gilt die Datenschutzerklärung von Cloudflare.</p>
<p>Sollte die Protokollierung zur Fehlersuche vorübergehend eingeschaltet werden, wird das
hier vermerkt.</p>

<h2>Was in Ihrem Browser gespeichert wird</h2>
<p>Die Seite legt zwei Werte im lokalen Speicher Ihres Browsers ab. Diese Werte verlassen Ihr
Gerät nie. Sie werden nicht an den Server gesendet und niemand außer Ihnen kann sie lesen.</p>
<ul>
  <li><code>htw.sg</code>: die Nummer des zuletzt gewählten Studiengangs, damit er beim
    nächsten Besuch schon ausgewählt ist.</li>
  <li><code>htw.intro.v1</code>: die Bestätigung, dass Sie die Hinweisseite gelesen haben,
    damit sie nicht bei jedem Besuch wieder erscheint.</li>
</ul>
<p>Beides sind keine Cookies. Beides enthält keine Angaben zu Ihrer Person. Sie können die
Werte jederzeit löschen, indem Sie in Ihrem Browser die Daten dieser Seite löschen. Danach
funktioniert alles weiter, die Seite fragt nur wieder von vorn. Auch wenn Ihr Browser lokalen
Speicher verbietet, bleibt das Werkzeug voll benutzbar.</p>
<p>Ein Einwilligungsbanner gibt es nicht. Gespeichert wird nur, was Sie selbst gerade in der
Seite eingestellt haben, und es geht an niemanden weiter.</p>

<h2>Was auf dem Server gespeichert wird</h2>
<p>Die Daten liegen in einem Schlüssel-Wert-Speicher von Cloudflare (Workers KV). Gespeichert
werden genau drei Dinge:</p>
<ul>
  <li><b>Die Liste der Studiengänge</b> der HTW, aus dem LSF abgerufen.</li>
  <li><b>Die abgerufenen Vorlesungspläne selbst</b>, also die öffentlichen
    Veranstaltungsdaten. Sie laufen 60 Tage nach der letzten Aktualisierung ab.</li>
  <li><b>Ein Eintrag pro abgerufener Kohorte</b>, damit der Hintergrundabgleich weiß, welche
    Pläne aktuell gehalten werden müssen. Dieser Eintrag besteht aus der Studiengangsnummer,
    dem Fachsemester und zwei Zeitstempeln: wann die Kohorte zum ersten Mal und wann sie
    zuletzt abgerufen wurde. Er enthält <b>keinerlei Bezug zu einer Person</b>, weder eine
    IP-Adresse noch eine Kennung noch die Kursauswahl. Nur die Kombination aus Studiengang und
    Fachsemester, die auf viele Hundert Studierende zugleich passt. Er läuft 45 Tage nach der
    letzten Nutzung von selbst ab.</li>
</ul>
<p>Es gibt keine Datenbank mit Abonnenten. Der Dienst weiß nicht, wer ein Abo eingerichtet hat,
wie viele es sind oder welche Kurse jemand abgewählt hat. Diese Auswahl steht nur in Ihrer
Abo-Adresse und wird bei jedem Abruf frisch angewendet.</p>

<h2>Ihre Abo-Adresse</h2>
<div class="box">
  <p><b>Die Abo-Adresse enthält Ihren Studiengang, Ihr Fachsemester, Ihre Gruppe und Ihre
  abgewählten Kurse im Klartext.</b> Wer die Adresse kennt, kennt damit Ihren Stundenplan.
  Geben Sie sie nur an Menschen weiter, denen Sie Ihren Stundenplan zeigen wollen.</p>
</div>
<p>Damit solche Adressen nicht in Suchmaschinen landen, sendet der Dienst für alle Feed-Abrufe
den Kopfzeilen-Hinweis <code>X-Robots-Tag: noindex, nofollow</code> und schließt den Pfad
<code>/feed/</code> zusätzlich in der <a href="/robots.txt">robots.txt</a> aus. Beides sind
Bitten an Suchmaschinen. Sie schützen nicht davor, dass jemand die Adresse weitergibt.</p>
<p>Die Adresse ist nicht widerrufbar und lässt sich nicht sperren, weil sie nirgends
registriert ist. Wenn Sie nicht mehr möchten, dass eine bestimmte Adresse funktioniert, dann
erzeugen Sie einfach eine neue und tragen sie in Ihrer Kalender-App ein. Alte Adressen liefern
weiterhin Daten, solange die zugehörigen Pläne im Speicher liegen.</p>

<h2>Empfänger</h2>
<p>Ihre Daten werden nicht verkauft und nicht für Werbung genutzt. Es gibt genau einen
Empfänger:</p>
<p><b>Cloudflare, Inc.</b>, 101 Townsend St., San Francisco, CA 94107, USA, sowie deren
europäische Gesellschaft Cloudflare Germany GmbH. Cloudflare betreibt die Server, auf denen
dieser Dienst läuft, und handelt dabei als Auftragsverarbeiter nach Art. 28 DSGVO. Cloudflare
ist ein US-Unternehmen, unterhält aber Rechenzentren in der EU. Für Übermittlungen in die USA
stützt sich Cloudflare auf die Standardvertragsklauseln der EU-Kommission. Näheres steht in der
Datenschutzerklärung von Cloudflare unter
<a href="https://www.cloudflare.com/privacypolicy/" rel="noopener noreferrer">cloudflare.com/privacypolicy</a>.</p>
<p>An die HTW Berlin werden keine Daten übermittelt. Der Dienst ruft dort nur öffentliche
Seiten ab, so wie es jeder Browser auch täte.</p>

<h2>Speicherdauer auf einen Blick</h2>
<ul>
  <li>Vorlesungspläne: 60 Tage nach der letzten Aktualisierung.</li>
  <li>Kohorten-Eintrag aus Studiengang und Fachsemester: 45 Tage nach der letzten Nutzung.</li>
  <li>Studiengangsliste: wird regelmäßig neu geholt und ersetzt.</li>
  <li>Werte im lokalen Speicher Ihres Browsers: bis Sie sie löschen.</li>
  <li>Protokolle bei Cloudflare: nach deren Vorgabe, siehe oben.</li>
</ul>

<h2>Ihre Rechte</h2>
<p>Sie haben nach der DSGVO das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung
(Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und
Widerspruch gegen die Verarbeitung (Art. 21). Wenden Sie sich dafür an die oben genannte
E-Mail-Adresse.</p>
<p>Ehrlicherweise: Eine Auskunft wird in aller Regel leer ausfallen. Der Dienst speichert
nichts, was sich einer Person zuordnen ließe, und kann eine Anfrage deshalb auch keinem
Datensatz zuordnen. Was bei Cloudflare an Protokollen liegt, lässt sich von hier aus weder
durchsuchen noch gezielt löschen.</p>

<h2>Beschwerderecht</h2>
<p>Sie können sich bei einer Datenschutz-Aufsichtsbehörde beschweren. Zuständig ist die
Behörde an Ihrem Wohnort, Ihrem Arbeitsplatz oder am Ort des vermuteten Verstoßes. Für dieses
Angebot ist das:</p>
<address>
Berliner Beauftragte für Datenschutz und Informationsfreiheit<br>
Alt-Moabit 59-61<br>
10555 Berlin<br>
Telefon: +49 30 13889-0<br>
E-Mail: <a href="mailto:mailbox@datenschutz-berlin.de">mailbox@datenschutz-berlin.de</a><br>
Web: <a href="https://www.datenschutz-berlin.de" rel="noopener noreferrer">www.datenschutz-berlin.de</a>
</address>

<h2>Keine automatisierten Entscheidungen</h2>
<p>Es findet keine automatisierte Entscheidungsfindung statt und es werden keine Profile
gebildet.</p>

<h2>Änderungen</h2>
<p>Ändert sich etwas an der Technik, wird diese Erklärung angepasst. Es gilt jeweils die
Fassung, die hier steht.</p>`,
    operator === null ? unconfiguredBox(missing) : '',
  );
}
