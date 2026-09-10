/** The picker UI. Served inline so the Worker needs no static asset hosting. */
export function renderPage(): string {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HTW Stundenplan als Kalender-Abo</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' rx='3' fill='%231f6feb'/%3E%3Crect x='3' y='5' width='10' height='8' rx='1' fill='white'/%3E%3Crect x='3' y='3' width='10' height='3' rx='1' fill='%230b3d91'/%3E%3C/svg%3E">
<style>
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
details.help { margin-top: 16px; border-top: 1px solid var(--line); padding-top: 14px; }
details.help summary {
  cursor: pointer; font-weight: 550; font-size: 0.92rem; list-style: none;
  display: flex; align-items: center; gap: 7px;
}
details.help summary::-webkit-details-marker { display: none; }
details.help summary::before { content: "▸"; color: var(--muted); }
details.help[open] summary::before { content: "▾"; }
details.help h4 { margin: 16px 0 4px; font-size: 0.88rem; }
details.help ol { margin: 0; padding-left: 20px; font-size: 0.88rem; color: var(--fg); }
details.help li { margin: 3px 0; }
details.help .src { font-size: 0.82rem; color: var(--muted); margin: 5px 0 0; }
.note { color: var(--muted); font-size: 0.85rem; margin-top: 22px; }
footer.legal {
  margin-top: 30px; padding-top: 16px; border-top: 1px solid var(--line);
  font-size: 0.85rem; color: var(--muted); display: flex; gap: 16px; flex-wrap: wrap;
}
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
</style>
</head>
<body>
<div class="wrap">

<section id="intro" class="intro" hidden>
  <h1>HTW-Stundenplan abonnieren</h1>
  <p class="sub">Das LSF zeigt dir deinen Stundenplan, lässt ihn aber nicht exportieren.
  Dieses Werkzeug liest die öffentlichen Vorlesungspläne aus und macht daraus einen Kalender
  zum Abonnieren. Einmal einrichten, danach hält er sich selbst aktuell.</p>

  <h2>So läuft es ab</h2>
  <ol class="steps">
    <li>Studiengang, Fachsemester und Gruppe wählen.</li>
    <li>Kurse abwählen, die du nicht belegst.</li>
    <li>Den erzeugten Link in deiner Kalender-App als Abo eintragen.</li>
  </ol>

  <h2>Wie aktuell ist der Kalender?</h2>
  <ul>
    <li>Wir gleichen <b>viermal täglich</b> mit dem LSF ab. Ausfälle und Raumänderungen
      kommen also von selbst an.</li>
    <li>Wie schnell sie bei dir ankommen, entscheidet aber <b>deine Kalender-App</b>:
      Apple Kalender lässt sich pro Abo auf stündlich stellen, Google Kalender prüft nach
      eigenem Ermessen und braucht mitunter bis zu einem Tag.</li>
    <li>Ein Ausfall, der morgens für denselben Tag eingetragen wird, kann dich deshalb zu
      spät erreichen. <b>Verbindlich ist immer das LSF.</b></li>
  </ul>

  <h2>Was beim Semesterwechsel passiert</h2>
  <ul>
    <li><b>Der Link wandert mit.</b> Aus dem 3. wird automatisch das 4.
      Fachsemester, du musst nichts neu einrichten.</li>
    <li><b>Das abgelaufene Semester verschwindet dabei aus dem Kalender</b>, weil das LSF
      alle Veranstaltungen neu anlegt. Willst du es behalten, lade es vorher über
      „Einmalig herunterladen“ als feste Kopie herunter. Die wird nie wieder verändert.</li>
    <li><b>Deine Kursauswahl gilt nur für das Semester, in dem du sie triffst.</b> Im nächsten
      sind zunächst wieder alle Kurse deines Fachsemesters dabei. Wenn du Wahlpflichtfächer
      hast, erzeugst du den Link einmal pro Semester neu.</li>
  </ul>

  <h2>Bevor du loslegst</h2>
  <ul>
    <li>Der Link enthält Studiengang, Semester, Gruppe und Kursauswahl <b>im Klartext</b>.
      Teile ihn nur mit Leuten, denen du deinen Stundenplan zeigen willst.</li>
    <li>Nicht jeder Fachbereich pflegt Räume ins LSF ein. Bei Game Design zum Beispiel
      stehen dort keine. Dann bleibt das Ortsfeld im Kalender leer.</li>
    <li>Die Daten stammen unverändert aus den öffentlichen Vorlesungsplänen. Ohne Gewähr.</li>
  </ul>

  <div class="gate">
    <button class="primary" id="go">Verstanden und weiter</button>
  </div>

  <footer class="legal">
    <a href="/impressum">Impressum</a>
    <a href="/datenschutz">Datenschutz</a>
  </footer>
</section>

<section id="app" hidden>
<h1>HTW-Stundenplan abonnieren</h1>
<p class="sub">Erzeugt aus den öffentlichen Vorlesungsplänen des LSF einen Kalender-Link,
der sich selbst aktuell hält, inklusive Ausfällen und Raumänderungen.
<button class="backlink" id="again">Hinweise nochmal lesen</button></p>

<fieldset>
  <legend>1 · Wer bist du?</legend>
  <label for="sg">Studiengang</label>
  <select id="sg"><option value="">wird geladen …</option></select>
  <div class="row">
    <div>
      <label for="sem">Fachsemester</label>
      <input type="number" id="sem" min="1" max="20" value="1">
    </div>
    <div style="display:flex;align-items:flex-end">
      <button id="load" class="primary" style="width:100%">Kurse laden</button>
    </div>
  </div>
  <p class="status" id="s1"></p>
</fieldset>

<fieldset id="step2" hidden>
  <legend>2 · Deine Gruppe</legend>
  <p class="sub" style="margin:0 0 4px">Veranstaltungen ohne Gruppenangabe sind immer dabei.</p>
  <div class="list" id="groups"></div>
</fieldset>

<fieldset id="step3" hidden>
  <legend>3 · Deine Kurse</legend>
  <p class="sub" style="margin:0 0 4px">Abwählen, was du nicht belegst, etwa fremde Wahlpflichtfächer.</p>
  <div class="list" id="courses"></div>
</fieldset>

<fieldset id="step4" hidden>
  <legend>4 · Einstellungen</legend>
  <label for="name">Name des Kalenders</label>
  <input type="text" id="name" placeholder="z. B. Studium">
  <label style="margin-top:16px">Wenn das LSF ins nächste Semester wechselt …</label>
  <label class="check">
    <input type="radio" name="roll" id="rollOn" value="1" checked>
    <span>… soll der Kalender mitwandern<br>
      <span class="meta">Aus dem <b class="semA">1.</b> wird dann das <b class="semB">2.</b> Fachsemester.
      Das willst du, wenn es dein eigener Stundenplan ist.</span></span>
  </label>
  <label class="check">
    <input type="radio" name="roll" id="rollOff" value="0">
    <span>… soll er beim <b class="semA">1.</b> Fachsemester bleiben<br>
      <span class="meta">Zeigt dauerhaft den Plan dieses Fachsemesters, ab dann also den eines
      anderen Jahrgangs. Sinnvoll für Tutorien oder wenn du ein Semester pausierst.</span></span>
  </label>
  <label class="check">
    <input type="checkbox" id="cancelled" checked>
    <span>Ausgefallene Termine anzeigen<br>
      <span class="meta">Durchgestrichen statt gelöscht, so siehst du, dass etwas ausfällt.</span></span>
  </label>
</fieldset>

<fieldset class="out" id="out">
  <legend>5 · Dein Link</legend>
  <code class="link" id="url"></code>
  <div class="actions">
    <button class="primary" id="copy">Link kopieren</button>
    <button id="dl" title="Lädt den aktuellen Stand als Datei. Anders als das Abo wird eine so importierte Kopie nie wieder aktualisiert. Praktisch, um ein abgeschlossenes Semester zu archivieren.">Einmalig herunterladen</button>
  </div>
  <p class="status" id="s2"></p>

  <details class="help">
    <summary>Wie trage ich den Link in meinen Kalender ein?</summary>
    <p class="src" style="margin-top:10px">Wichtig: als <b>Abo</b> eintragen, nicht als Datei
    importieren. Nur ein Abo holt sich spätere Änderungen von allein.</p>

    <h4>Google Kalender</h4>
    <ol>
      <li>Google Kalender im Browser öffnen, am Computer. Über die Handy-App geht es nicht.</li>
      <li>Links neben „Weitere Kalender“ auf das Pluszeichen klicken, dann „Per URL“.</li>
      <li>Den Link einfügen und auf „Kalender hinzufügen“ klicken.</li>
    </ol>
    <p class="src"><a href="https://support.google.com/calendar/answer/37100?hl=de&amp;co=GENIE.Platform%3DDesktop" target="_blank" rel="noopener">Hilfeseite von Google</a></p>

    <h4>Apple Kalender am Mac</h4>
    <ol>
      <li>In der App „Kalender“ auf „Ablage“ und „Neues Kalenderabonnement“ gehen.</li>
      <li>Den Link eingeben und auf „Abonnieren“ klicken.</li>
      <li>Bei „Automatisch aktualisieren“ ein Intervall wählen. Stündlich ist eine gute Wahl.</li>
    </ol>
    <p class="src"><a href="https://support.apple.com/de-de/guide/calendar/icl1022/mac" target="_blank" rel="noopener">Hilfeseite von Apple</a></p>

    <h4>Apple Kalender am iPhone oder iPad</h4>
    <ol>
      <li>Einstellungen öffnen, auf „Apps“ und dann „Kalender“ tippen. Bei iOS 17 und älter
        direkt auf „Kalender“.</li>
      <li>Auf „Kalender-Accounts“, „Account hinzufügen“ und „Andere“ tippen.</li>
      <li>„Kalenderabo hinzufügen“ wählen, den Link eingeben und sichern.</li>
    </ol>
    <p class="src"><a href="https://support.apple.com/de-de/guide/iphone/ipha0d932e96/ios" target="_blank" rel="noopener">Hilfeseite von Apple</a></p>

    <h4>Outlook im Web</h4>
    <ol>
      <li>Im Kalender auf „Kalender hinzufügen“ gehen.</li>
      <li>„Aus dem Internet abonnieren“ wählen, je nach Konto auch „Vom Web abonnieren“ genannt.</li>
      <li>Den Link einfügen, einen Namen vergeben und speichern.</li>
    </ol>
    <p class="src"><a href="https://support.microsoft.com/de-de/office/importieren-oder-abonnieren-eines-kalenders-in-outlook-com-oder-outlook-im-web-cff1429c-5af6-41ec-a5b4-74f2c278e98c" target="_blank" rel="noopener">Hilfeseite von Microsoft</a></p>

    <p class="src" style="margin-top:14px">Wie schnell Änderungen ankommen, entscheidet deine
    App. Am Mac stellst du das selbst ein. Outlook prüft laut Microsoft alle drei bis sechs
    Stunden. Google nennt keinen Wert und braucht erfahrungsgemäß deutlich länger.</p>
  </details>
</fieldset>

<p class="note"><strong>Achtung:</strong> Der Link enthält deinen Studiengang, dein Semester
und deine Kursauswahl im Klartext. Teile ihn nur mit Leuten, denen du deinen Stundenplan
zeigen willst.</p>
<p class="note">Die Daten stammen aus den öffentlich einsehbaren Vorlesungsplänen des
HTW-LSF und werden mehrmals täglich abgeglichen. Ohne Gewähr, im Zweifel gilt das LSF.</p>

<footer class="legal">
  <a href="/impressum">Impressum</a>
  <a href="/datenschutz">Datenschutz</a>
</footer>
</section>
</div>

<script>
const $ = (id) => document.getElementById(id);
const state = { courses: [], groups: [], semesterCode: '' };

async function loadPrograms() {
  try {
    const r = await fetch('/api/programs');
    const d = await r.json();
    if (d.pending) {
      $('s1').textContent = 'Studiengangsliste wird zum ersten Mal geladen, gleich noch einmal versuchen.';
      setTimeout(loadPrograms, 3000);
      return;
    }
    $('sg').innerHTML = '<option value="">bitte wählen</option>' +
      d.programs.map((p) => '<option value="' + p.id + '">' + esc(p.name) +
        (p.po ? ' · PO ' + p.po : '') + '</option>').join('');
    const saved = localStorage.getItem('htw.sg');
    if (saved) $('sg').value = saved;
  } catch (e) {
    $('s1').className = 'status err';
    $('s1').textContent = 'Studiengänge konnten nicht geladen werden.';
  }
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

async function loadCourses() {
  const sg = $('sg').value, sem = $('sem').value;
  if (!sg) { $('s1').textContent = 'Bitte zuerst einen Studiengang wählen.'; return; }
  localStorage.setItem('htw.sg', sg);
  $('load').disabled = true;
  $('s1').className = 'status';
  $('s1').textContent = 'Lade Kurse aus dem LSF …';
  try {
    const r = await fetch('/api/courses?sg=' + encodeURIComponent(sg) + '&sem=' + encodeURIComponent(sem));
    const d = await r.json();
    if (d.pending) {
      $('s1').textContent = 'Der Plan wird gerade zum ersten Mal aus dem LSF geholt. Das dauert etwa eine halbe Minute …';
      setTimeout(loadCourses, 6000);
      return;
    }
    if (!d.courses.length) {
      $('s1').className = 'status err';
      $('s1').textContent = 'Für dieses Fachsemester stehen im LSF keine Veranstaltungen.';
      return;
    }
    state.courses = d.courses;
    state.groups = d.groups;
    state.semesterCode = d.semesterCode || '';
    renderGroups();
    renderCourses();
    $('step2').hidden = state.groups.length === 0;
    $('step3').hidden = false;
    $('step4').hidden = false;
    $('s1').textContent = d.courses.length + ' Veranstaltungen · Semester ' + d.semester +
      ' · ' + d.weeksCrawled + '/' + d.weeksTotal + ' Wochen abgeglichen';
    if (!$('name').value) $('name').value = 'HTW ' + sem + '. Semester';
    update();
  } catch (e) {
    $('s1').className = 'status err';
    $('s1').textContent = 'Fehler beim Laden: ' + e.message;
  } finally {
    $('load').disabled = false;
  }
}

function renderGroups() {
  $('groups').innerHTML = state.groups.map((g, i) =>
    '<label class="check"><input type="checkbox" class="g" value="' + esc(g.slug) + '">' +
    '<span>' + esc(g.heading) + '</span></label>').join('') ||
    '<p class="sub" style="margin:0">Dieser Studiengang teilt nicht in Gruppen auf.</p>';
  for (const el of document.querySelectorAll('.g')) el.addEventListener('change', update);
}

function renderCourses() {
  $('courses').innerHTML = state.courses.map((c) =>
    '<label class="check"><input type="checkbox" class="c" value="' + esc(c.key) + '" checked>' +
    '<span>' + esc(c.title) + '<br><span class="meta">' +
    [c.art, c.sws ? c.sws + ' SWS' : '', c.belegung].filter(Boolean).map(esc).join(' · ') +
    '</span></span></label>').join('');
  for (const el of document.querySelectorAll('.c')) el.addEventListener('change', update);
}

function buildUrl() {
  const q = new URLSearchParams();
  q.set('v', '1');
  q.set('sg', $('sg').value);
  q.set('sem', $('sem').value);
  const groups = [...document.querySelectorAll('.g:checked')].map((e) => e.value).sort();
  if (groups.length) q.set('g', groups.join(','));
  const off = [...document.querySelectorAll('.c:not(:checked)')].map((e) => e.value).sort();
  if (off.length) q.set('x', off.join(','));
  if ($('rollOn').checked && state.semesterCode) {
    q.set('anchor', state.semesterCode);
    q.set('roll', '1');
  }
  if ($('name').value.trim()) q.set('n', $('name').value.trim());
  if (!$('cancelled').checked) q.set('cancelled', 'hide');
  return location.origin + '/feed/htw.ics?' + q.toString();
}

/** Keeps the rollover explanation talking about the student's actual Fachsemester. */
function paintSemesterLabels() {
  const n = Math.max(1, Math.min(20, Number($('sem').value) || 1));
  for (const el of document.querySelectorAll('.semA')) el.textContent = n + '.';
  for (const el of document.querySelectorAll('.semB')) el.textContent = (n + 1) + '.';
}

function update() {
  paintSemesterLabels();
  const url = buildUrl();
  $('url').textContent = url;
  $('out').classList.add('show');
  const n = state.courses.length - document.querySelectorAll('.c:not(:checked)').length;
  $('s2').textContent = n + ' von ' + state.courses.length + ' Kursen ausgewählt.';
}

$('load').addEventListener('click', loadCourses);
for (const id of ['rollOn', 'rollOff', 'cancelled', 'name']) $(id).addEventListener('input', update);
$('sem').addEventListener('input', paintSemesterLabels);
$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(buildUrl());
    $('s2').textContent = 'Kopiert. In Google/Apple/Outlook unter „Kalender abonnieren“ einfügen.';
  } catch {
    $('s2').textContent = 'Kopieren nicht möglich, bitte den Link von Hand markieren.';
  }
});
$('dl').addEventListener('click', () => {
  // Über einen Anker statt open(), sonst bleibt beim Herunterladen ein leerer Tab zurück.
  const a = document.createElement('a');
  a.href = buildUrl();
  a.download = 'htw-stundenplan.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
});

/**
 * Zwei Ansichten, keine Navigation: erst die Hinweise, dann die Auswahl.
 *
 * Die Bestätigung wird gemerkt, damit Wiederkehrende nicht jedes Mal durch dieselbe Seite
 * müssen. Über „Hinweise nochmal lesen“ ist sie jederzeit wieder erreichbar. Lässt der
 * Browser kein localStorage zu, wird eben immer erklärt; das ist der harmlosere Fehlerfall.
 */
const SEEN = 'htw.intro.v1';
let programsLoaded = false;

function render(view) {
  const intro = view === 'intro';
  $('intro').hidden = !intro;
  $('app').hidden = intro;
  scrollTo(0, 0);
  if (!intro && !programsLoaded) { programsLoaded = true; loadPrograms(); }
}

/**
 * Die beiden Ansichten liegen auf einer Seite, bekommen aber je einen History-Eintrag.
 * Sonst würde der Zurück-Knopf des Browsers die Seite verlassen statt zur Auswahl
 * zurückzuspringen, was hier niemand erwartet.
 */
function go(view) {
  if (history.state?.view !== view) history.pushState({ view }, '');
  render(view);
}

addEventListener('popstate', (e) => render(e.state?.view === 'intro' ? 'intro' : 'app'));

$('go').addEventListener('click', () => {
  try { localStorage.setItem(SEEN, '1'); } catch {}
  go('app');
});
$('again').addEventListener('click', () => go('intro'));

let seen = false;
try { seen = localStorage.getItem(SEEN) === '1'; } catch {}
paintSemesterLabels();
const start = seen ? 'app' : 'intro';
history.replaceState({ view: start }, '');
render(start);
</script>
</body>
</html>`;
}
