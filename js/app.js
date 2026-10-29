import {
  KINDS, PRESETS, GROUPS, kindOf, evaluate, relevantKeys, completionId, nextSwap,
  packageOwners, localToday, toDay, fromDay, groupOf, windowsBetween, awayDuring,
} from './logic.js';
import { openStore, newCode, newId, normalizeCode, formatCode } from './store.js';
import { TEMPLATE, TEMPLATE_RULES } from './template.js';

// ---------- Konstanten & Hilfen ----------

const COLORS = [
  ['rosa', 'Rosa'], ['blau', 'Blau'], ['gelb', 'Gelb'],
  ['gruen', 'Grün'], ['schwarz', 'Schwarz'], ['weiss', 'Weiß'],
];
const KIND_LABEL = {
  daily: 'Täglich', weekly: 'Wöchentlich', biweekly: 'Alle 2 Wochen', monthly: 'Monatlich',
  quarterly: 'Vierteljährlich', halfyear: 'Halbjährlich', yearly: 'Jährlich', custom: 'Eigenes Intervall',
  asneeded: 'Bei Bedarf',
};
const ASSIGN_LABEL = { A: 'Paket A', B: 'Paket B', shared: 'Gemeinsam', each: 'Pro Person', alternate: 'Abwechselnd' };
const GROUP_LABEL = { short: 'Täglich bis monatlich', quarter: 'Vierteljährlich', half: 'Halbjährlich', year: 'Jährlich' };
const UNIT_LABEL = { day: ['Tag', 'Tage'], week: ['Woche', 'Wochen'], month: ['Monat', 'Monate'] };
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('de-AT', { month: 'long' }));
const DEFAULT_HOUSEHOLD = {
  swapped: false,
  rotation: { short: 2, quarter: 6, half: 12, year: 12 },
  sharedDay: { halfyearMonth: 4, halfyearDay: 15, yearlyMonth: 4, yearlyDay: 15 },
};

const LOGO = '<h1 class="logo"><span>fair</span><span>plan</span></h1>';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const ls = {
  get: (k) => { try { return localStorage.getItem(`fairplan.${k}`); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(`fairplan.${k}`) : localStorage.setItem(`fairplan.${k}`, v); } catch { /* ignorieren */ } },
};

const asDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
function fmtDate(s, withYear) {
  const d = asDate(s);
  const y = withYear ?? d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString('de-AT', { day: 'numeric', month: 'numeric', ...(y ? { year: 'numeric' } : {}) });
}
const fmtLong = (s) => asDate(s).toLocaleDateString('de-AT', { day: 'numeric', month: 'long', year: 'numeric' });
const intervalLabel = (t) => {
  const k = kindOf(t);
  const day = (k === 'weekly' || k === 'biweekly') && Number.isInteger(t.wd) ? ` am ${WEEKDAYS[t.wd]}` : '';
  return (k === 'custom' ? `Alle ${t.n} ${UNIT_LABEL[t.unit][t.n === 1 ? 0 : 1]}` : KIND_LABEL[k]) + day;
};
const seasonLabel = (s) => `${MONTHS[s.from - 1]}–${MONTHS[s.to - 1]}`;
const rangeLabel = (a, b) => (a === b ? fmtDate(a) : `${fmtDate(a)}–${fmtDate(b)}`);
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const weekdayOf = (s) => (asDate(s).getDay() + 6) % 7; // Mo=0
const fmtWd = (s) => `${WEEKDAYS[weekdayOf(s)]} ${fmtDate(s)}`;

// ---------- Zustand ----------

const S = {
  store: null,
  code: ls.get('code'),
  me: ls.get('me'),
  view: 'heute',
  filter: 'all',
  calMonth: null, // 'YYYY-MM', null = aktueller Monat
  calDay: null, // ausgewählter Tag, null = heute
  today: localToday(),
  hh: undefined, // undefined = lädt, null = nicht gefunden
  tasks: [],
  tasksLoaded: false,
  comps: new Map(),
  history: [],
  setup: null,
  subs: [],
  compSub: null,
  compSig: '',
  histSub: null,
  daySub: null, // Erledigungen im Kalenderzeitraum
  daySig: '',
  dayComps: [],
  open: {}, // aufgeklappte Bereiche (details) über Neuzeichnen hinweg
  pendingRender: false,
};

const app = $('#app');
const person = (id) => S.hh?.persons.find((p) => p.id === id);
const pn = (id) => {
  const p = person(id);
  return p ? `<span class="pn"><i class="sw" style="--pc:var(--c-${p.color})"></i>${esc(p.name)}</span>` : '';
};
const byName = (id) => { const p = person(id); return p ? `<span class="by" data-c="${p.color}">${esc(p.name)}</span>` : '?'; };

// ---------- Start ----------

init();

async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  try {
    S.store = await openStore();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<header class="top">${LOGO}</header>
      <p>Keine Verbindung zur Datenbank. Beim allerersten Start muss das Gerät online sein.</p>
      <div class="btnrow"><button class="btn primary" onclick="location.reload()">Erneut versuchen</button></div>`;
    return;
  }
  if (S.code) connect(S.code);
  else startSetup();

  // Tageswechsel erkennen (z. B. App über Nacht offen)
  const tick = () => {
    const t = localToday();
    if (t !== S.today) { S.today = t; refreshCompletions(); render(); }
  };
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

function connect(code) {
  S.code = code;
  S.subs.forEach((u) => u());
  S.subs = [
    S.store.watchHousehold(code, (hh) => {
      S.hh = hh ? { ...DEFAULT_HOUSEHOLD, ...hh } : null;
      refreshCompletions();
      render();
    }),
    S.store.watchTasks(code, (tasks) => {
      S.tasks = tasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      S.tasksLoaded = true;
      refreshCompletions();
      render();
    }),
  ];
}

// Nur die Erledigungen der aktuellen und vorherigen Perioden laden (spart Lesezugriffe)
function refreshCompletions() {
  if (!S.hh || !S.tasksLoaded) return;
  const keys = relevantKeys(S.tasks, S.hh, S.today);
  const sig = keys.join('|');
  if (sig === S.compSig) return;
  S.compSig = sig;
  S.compSub?.();
  S.compSub = S.store.watchCompletions(S.code, keys, (m) => { S.comps = m; render(); });
}

function watchHistory(on) {
  if (on && !S.histSub) {
    S.histSub = () => {}; // vorab setzen, falls der Listener sofort rendert
    S.histSub = S.store.watchHistory(S.code, 150, (h) => { S.history = h; render(); });
  }
  if (!on && S.histSub) { S.histSub(); S.histSub = null; }
}

// Erledigungen für den sichtbaren Kalenderzeitraum laden; null = abmelden
function watchDays(range) {
  const sig = range ? range.join('|') : '';
  if (sig === S.daySig) return;
  S.daySig = sig;
  S.daySub?.();
  S.daySub = null;
  S.dayComps = [];
  if (range) S.daySub = S.store.watchDays(S.code, range[0], range[1], (list) => { S.dayComps = list; render(); });
}

// ---------- Rendern ----------

// Nicht neu zeichnen, während jemand in ein Feld tippt
app.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender) render(); }, 0));

function render() {
  if (S.setup) return renderSetup();
  const a = document.activeElement;
  if (a && app.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox') {
    S.pendingRender = true;
    return;
  }
  S.pendingRender = false;
  if (S.hh === undefined || !S.tasksLoaded) {
    app.innerHTML = '<p class="loading">Fairplan wird geladen …</p>';
    return;
  }
  if (S.hh === null) {
    app.innerHTML = `<header class="top">${LOGO}</header>
      <p>Dieser Haushalt wurde nicht gefunden.</p>
      <div class="btnrow"><button class="btn primary" data-action="leave">Neu einrichten</button></div>`;
    return;
  }
  if (!person(S.me)) return renderWhoAmI();

  const views = { heute: viewToday, alle: viewAll, kalender: viewCalendar, verlauf: viewHistory, einstellungen: viewSettings };
  watchHistory(S.view === 'verlauf');
  watchDays(S.view === 'kalender' ? calRange() : S.view === 'verlauf' ? [`${S.today.slice(0, 7)}-01`, S.today] : null);
  const tabs = [['heute', 'Heute'], ['alle', 'Alle'], ['kalender', 'Kalender'], ['verlauf', 'Verlauf'], ['einstellungen', 'Optionen']]
    .map(([v, l]) => `<button data-view="${v}" ${S.view === v ? 'aria-current="page"' : ''}>${l}</button>`).join('');
  const scroll = window.scrollY;
  app.innerHTML = `<header class="top">${LOGO}<span class="who">${pn(S.me)}</span></header>
    ${views[S.view]()}
    <nav class="tabs">${tabs}</nav>`;
  window.scrollTo(0, scroll);
  updateBadge();
}

function allItems() {
  return S.tasks.flatMap((t) => evaluate(t, S.hh, S.today, S.comps));
}

const kindRank = (t) => KINDS.indexOf(kindOf(t));
const sortItems = (items) => items.sort((a, b) =>
  (a.status === 'overdue' ? 0 : 1) - (b.status === 'overdue' ? 0 : 1) ||
  kindRank(a.task) - kindRank(b.task) || (a.task.order ?? 0) - (b.task.order ?? 0));

function ownerText(it) {
  const t = it.task;
  if (it.owner === null) return 'Gemeinsam';
  const extra = t.assign === 'A' || t.assign === 'B' ? ` · ${ASSIGN_LABEL[t.assign]}`
    : t.assign === 'each' ? ' · pro Person' : t.assign === 'alternate' ? ' · abwechselnd' : '';
  return `${pn(it.owner)}${extra}`;
}

function statusText(it) {
  const c = it.completion;
  switch (it.status) {
    case 'overdue': return `war dran ${rangeLabel(it.due, it.end)} · <span class="ov">noch erledigen</span>`;
    case 'due': return kindOf(it.task) === 'daily' ? '' : `dran bis ${fmtDate(it.end)}`;
    case 'upcoming': return `dran ${rangeLabel(it.due, it.end)}`;
    case 'done': {
      const proxy = c.forPerson && c.forPerson !== c.by ? ` für ${esc(person(c.forPerson)?.name ?? '?')}` : '';
      return `erledigt von ${byName(c.by)}${proxy}, ${fmtDate(c.day)}`;
    }
    case 'need': return '';
    case 'offseason': return `Saison ${seasonLabel(it.task.season)}${it.next ? ` · ab ${fmtDate(it.next)}` : ''}`;
    default: return it.next ? `nächste Fälligkeit ${fmtDate(it.next)}` : '';
  }
}

// lead: was vor dem Status steht – 'owner' (Zuständigkeit), 'shared' (nur „Gemeinsam“) oder 'interval'
function itemRow(it, { lead = 'interval' } = {}) {
  const p = person(it.owner);
  const active = ['due', 'overdue', 'upcoming', 'done', 'need'].includes(it.status);
  const first = lead === 'owner' ? ownerText(it) : lead === 'shared' ? (it.owner === null ? 'Gemeinsam' : '') : intervalLabel(it.task);
  const meta = [first, statusText(it)].filter(Boolean).join(' · ');
  const cls = [it.status, active ? '' : 'inactive'].join(' ');
  return `<div class="item ${cls}" style="--pc:${p ? `var(--c-${p.color})` : 'var(--shared)'}">
    <span class="strip"></span>
    <label class="check"><input type="checkbox" data-action="toggle" data-task="${esc(it.task.id)}" data-slot="${esc(it.slot ?? '')}"
      ${it.status === 'done' ? 'checked' : ''} ${active ? '' : 'disabled'} aria-label="${esc(it.task.title)} erledigt"><span class="box"></span></label>
    <div class="body">${it.status === 'overdue' ? '<span class="badge">Nicht geschafft</span>' : ''}<div class="title">${esc(it.task.title)}</div>
      ${it.task.note ? `<div class="note">${esc(it.task.note)}</div>` : ''}
      ${meta ? `<div class="meta">${meta}</div>` : ''}</div>
  </div>`;
}

// Aufklappbarer Bereich; Zustand bleibt beim Neuzeichnen erhalten
function fold(key, summary, body) {
  return `<details class="fold" data-fold="${key}" ${S.open[key] ? 'open' : ''}><summary>${summary}</summary>${body}</details>`;
}

// Erledigt pro Person (für die Fairness-Bilanz)
function balance(list) {
  return S.hh.persons.map((p) => `${pn(p.id)} <strong>${list.filter((c) => c.by === p.id).length}</strong>`).join(' · ');
}

function section(title, items, { lead, cls = '' } = {}) {
  return `<section class="group ${cls}"><h2>${esc(title)}<span class="count">${items.length}</span></h2>${listOf(items, { lead })}</section>`;
}

const listOf = (items, opts) => (items.length ? `<div class="list">${items.map((i) => itemRow(i, opts)).join('')}</div>` : '');

// Jetzt dran: Tägliches, was heute beginnt oder in den nächsten 2 Tagen endet
const isNow = (i) => kindOf(i.task) === 'daily' || i.due === S.today || i.end <= fromDay(toDay(S.today) + 2);

// Zahl am App-Icon: nicht Geschafftes + jetzt dran (eigenes und gemeinsames), ohne Tägliches
function badgeCount() {
  return allItems().filter((i) => (i.owner === S.me || i.owner === null) && kindOf(i.task) !== 'daily'
    && (i.status === 'overdue' || (i.status === 'due' && isNow(i)))).length;
}
let lastBadge = -1;
function updateBadge() {
  if (!('setAppBadge' in navigator)) return;
  const n = badgeCount();
  if (n === lastBadge) return;
  lastBadge = n;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

function badgeSetting() {
  if (!('setAppBadge' in navigator)) {
    return '<p class="small">Hier nicht möglich. Am iPhone geht das nur, wenn Fairplan vom Homescreen geöffnet wird (ab iOS 16.4).</p>';
  }
  const perm = 'Notification' in window ? Notification.permission : 'granted';
  if (perm === 'granted') return `<p class="small">Eingeschaltet. Gerade: ${badgeCount()}.</p>`;
  if (perm === 'denied') return '<p class="small">Mitteilungen sind gesperrt. Am iPhone: Einstellungen → Mitteilungen → Fairplan → Mitteilungen erlauben.</p>';
  return `<p class="small">Am iPhone muss man dafür Mitteilungen erlauben (es kommen keine Nachrichten, nur die Zahl).</p>
    <div class="btnrow"><button class="btn" data-action="badge">Zahl am App-Icon einschalten</button></div>`;
}

function viewToday() {
  const items = allItems();
  const mineOrShared = (i) => i.owner === S.me || i.owner === null;
  const open = items.filter((i) => i.status === 'due' || i.status === 'overdue');
  const todo = sortItems(open.filter(mineOrShared));
  const other = open.filter((i) => i.owner && i.owner !== S.me);
  const late = todo.filter((i) => i.status === 'overdue');
  // Jetzt: Tägliches, was heute beginnt oder in den nächsten 2 Tagen endet; der Rest eingeklappt
  const now = todo.filter((i) => i.status === 'due' && isNow(i));
  const later = todo.filter((i) => i.status === 'due' && !isNow(i));
  const need = sortItems(items.filter((i) => mineOrShared(i) && (i.status === 'need' || (i.status === 'done' && kindOf(i.task) === 'asneeded'))));
  const doneToday = items.filter((i) => i.status === 'done' && i.completion?.day === S.today && kindOf(i.task) !== 'asneeded');

  const total = todo.length;
  const away = S.hh.away?.[S.me];
  const meAway = away?.from && away.from <= S.today && S.today <= away.to;
  const banner = meAway
    ? `Du bist bis ${fmtDate(away.to)} als abwesend eingetragen. Deine Aufgaben pausieren.`
    : total
      ? `${total} ${total === 1 ? 'Aufgabe' : 'Aufgaben'} offen${late.length ? `, davon <span class="ov">${late.length} nicht geschafft</span>` : ''}${later.length ? `, ${later.length} davon haben noch Zeit` : ''}.`
      : 'Für dich ist heute nichts offen.';

  const used = new Set(S.tasks.filter((t) => t.assign === 'A' || t.assign === 'B').map(groupOf));
  const swaps = GROUPS.filter((g) => used.has(g))
    .map((g) => `<div>${GROUP_LABEL[g]}: ${fmtLong(nextSwap(g, S.hh, S.today))}</div>`).join('');

  const byKind = (list) => KINDS.map((k) => {
    const g = list.filter((i) => kindOf(i.task) === k);
    return g.length ? section(KIND_LABEL[k], g, { lead: 'shared' }) : '';
  }).join('');

  const rules = (S.hh.rules || []).filter(Boolean);
  return `<p class="banner ${late.length ? 'has-overdue' : ''}">${banner}</p>
    ${rules.length ? fold('rules', `Unsere Abmachungen <span class="count">${rules.length}</span>`,
      `<ul class="rules">${rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`) : ''}
    ${late.length ? section('Nicht geschafft – noch erledigen', late, { lead: 'shared', cls: 'late' }) : ''}
    ${byKind(now) || (late.length ? '' : '<p class="muted" style="margin-top:24px">Gerade ist nichts dringend.</p>')}
    ${later.length ? fold('later', `Hat noch Zeit <span class="count">${later.length}</span>`, byKind(later)) : ''}
    ${need.length ? fold('need', `Bei Bedarf <span class="count">${need.length}</span>`, listOf(need, { lead: 'shared' })) : ''}
    ${doneToday.length ? fold('done', `Heute erledigt <span class="count">${doneToday.length}</span>`, listOf(doneToday, { lead: 'owner' })) : ''}
    ${other.length ? `<p class="small" style="margin-top:24px">${pn(other[0].owner)} hat noch ${other.length} offen (unter „Alle“).</p>` : ''}
    ${swaps ? `<h2>Nächster Pakettausch</h2><div class="small">${swaps}</div>` : ''}`;
}

function filterBar() {
  const [p1, p2] = S.hh.persons;
  const f = S.filter;
  return [['all', 'Alle'], [p1.id, p1.name], [p2.id, p2.name], ['shared', 'Gemeinsam']]
    .map(([v, l]) => `<button data-filter="${esc(v)}" aria-pressed="${f === v}">${esc(l)}</button>`).join('');
}

function viewAll() {
  const f = S.filter;
  const items = allItems().filter((i) => f === 'all' || (f === 'shared' ? i.owner === null : i.owner === f));
  const groups = KINDS.map((k) => {
    const g = sortItems(items.filter((i) => kindOf(i.task) === k));
    return g.length ? section(KIND_LABEL[k], g, { lead: 'owner' }) : '';
  }).join('');
  return `<div class="filters">${filterBar()}</div>${groups || '<p class="muted" style="margin-top:24px">Keine Aufgaben.</p>'}`;
}

// Sichtbarer Kalenderzeitraum: ganze Wochen (Mo–So) rund um den Monat
function calRange() {
  const month = S.calMonth || S.today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const first = toDay(`${month}-01`);
  const last = first + new Date(y, m, 0).getDate() - 1;
  return [fromDay(first - weekdayOf(fromDay(first))), fromDay(last + 6 - weekdayOf(fromDay(last)))];
}

const paused = (w) => (w.owner === null
  ? S.hh.persons.every((p) => awayDuring(S.hh, p.id, toDay(w.start), toDay(w.end)))
  : awayDuring(S.hh, w.owner, toDay(w.start), toDay(w.end)));
const colorOf = (id) => { const p = person(id); return p ? `var(--c-${p.color})` : 'var(--shared)'; };

// Monatsraster ab Montag. Oben je Tag: Punkte = ab diesem Tag ist eine Aufgabe dran (Farbe = zuständig),
// unten: ✓ und Anzahl, was jede Person an diesem Tag erledigt hat.
// Darunter für den gewählten Tag: was dran ist (mit Zeitraum) und was wer erledigt hat.
function viewCalendar() {
  const f = S.filter;
  const month = S.calMonth || S.today.slice(0, 7);
  const sel = S.calDay || S.today;
  const first = toDay(`${month}-01`);
  const [from, to] = calRange();
  const gridStart = toDay(from), gridEnd = toDay(to);

  const match = (w) => f === 'all' || (f === 'shared' ? w.owner === null : w.owner === f);
  const wins = S.tasks
    .flatMap((t) => windowsBetween(t, S.hh, from, fromDay(Math.max(gridEnd, toDay(sel))))).filter(match);
  const starts = new Map();
  for (const w of wins) { if (!starts.has(w.start)) starts.set(w.start, []); starts.get(w.start).push(w); }

  const doneMatch = (c) => f === 'all' || (f === 'shared' ? c.forPerson == null : c.by === f);
  const doneList = S.dayComps.filter(doneMatch);
  const doneOn = new Map();
  for (const c of doneList) { if (!doneOn.has(c.day)) doneOn.set(c.day, []); doneOn.get(c.day).push(c); }
  const doneById = new Map([...S.comps, ...S.dayComps.map((c) => [c.id, c])]);

  const cells = [];
  for (let d = gridStart; d <= gridEnd; d++) {
    const ds = fromDay(d);
    const ws = starts.get(ds) || [];
    const dots = (ws.some((w) => kindOf(w.task) === 'daily') ? '<i class="daily"></i>' : '')
      + ws.filter((w) => kindOf(w.task) !== 'daily').map((w) => `<i style="--pc:${colorOf(w.owner)}"></i>`).join('');
    const counts = new Map();
    for (const c of doneOn.get(ds) || []) counts.set(c.by, (counts.get(c.by) || 0) + 1);
    const marks = S.hh.persons.filter((p) => counts.has(p.id))
      .map((p) => `<b class="by" data-c="${p.color}">✓${counts.get(p.id)}</b>`).join('');
    const out = ds.slice(0, 7) !== month;
    const cls = [out ? 'out' : '', ds === S.today ? 'today' : '', ds === sel ? 'sel' : ''].join(' ');
    cells.push(`<button class="day ${cls}" data-cal-day="${ds}"><span>${asDate(ds).getDate()}</span><span class="dots">${dots}</span><span class="marks">${marks}</span></button>`);
  }

  const relevant = new Set(relevantKeys(S.tasks, S.hh, S.today));
  const onDay = wins.filter((w) => w.start <= sel && sel <= w.end);
  const rows = KINDS.map((k) => {
    const g = onDay.filter((w) => kindOf(w.task) === k);
    if (!g.length) return '';
    const list = g.map((w) => {
      const done = doneById.get(completionId(w.task.id, w.key, w.slot));
      const pause = !done && paused(w);
      const missed = !done && !pause && kindOf(w.task) !== 'daily' && w.end < S.today && relevant.has(w.key);
      const state = done ? ` · ✓ ${byName(done.by)}, ${fmtWd(done.day)}` : pause ? ' · pausiert (abwesend)' : missed ? ' · <span class="ov">nicht geschafft</span>' : '';
      return `<div class="item ${missed ? 'overdue' : done ? 'done' : ''}" style="--pc:${colorOf(w.owner)}">
        <span class="strip"></span>
        <div class="body cal"><div class="title">${esc(w.task.title)}</div>
          <div class="meta">${w.owner === null ? 'Gemeinsam' : pn(w.owner)} · ${w.start === w.end ? fmtWd(w.start) : `${fmtWd(w.start)} bis ${fmtWd(w.end)}`}${state}</div></div>
      </div>`;
    }).join('');
    return `<section class="group"><h2>${KIND_LABEL[k]}<span class="count">${g.length}</span></h2><div class="list">${list}</div></section>`;
  }).join('');

  const doneSel = (doneOn.get(sel) || []).slice().sort((a, b) => a.at.localeCompare(b.at));
  const doneRows = doneSel.map((c) => {
    const time = new Date(c.at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
    const proxy = c.forPerson && c.forPerson !== c.by ? ` für ${esc(person(c.forPerson)?.name ?? '?')}` : '';
    return `<div class="hist"><span class="time">${time}</span><div><div>${esc(c.title)}</div>
      <div class="meta">${byName(c.by)}${proxy}</div></div></div>`;
  }).join('');

  const title = asDate(`${month}-01`).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
  const selTitle = asDate(sel).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<div class="filters">${filterBar()}</div>
    <div class="calhead">
      <button class="navbtn" data-cal-month="-1" aria-label="Voriger Monat">‹</button>
      <strong>${title}</strong>
      <button class="navbtn" data-cal-month="1" aria-label="Nächster Monat">›</button>
    </div>
    <div class="cal-grid">${WEEKDAYS.map((w) => `<span class="wd">${w}</span>`).join('')}${cells.join('')}</div>
    <p class="small">Punkt = ab diesem Tag dran (Farbe = wer, grauer Ring = Tägliches). ✓ = so viel hat die Person an dem Tag erledigt.</p>
    <p class="banner">Im ${esc(asDate(`${month}-01`).toLocaleDateString('de-AT', { month: 'long' }))} erledigt: ${balance(S.dayComps.filter((c) => c.day.startsWith(month)))}</p>
    <h2 class="calday">${esc(selTitle)}</h2>
    <section class="group"><h2>Erledigt<span class="count">${doneSel.length}</span></h2>
      ${doneRows || '<p class="muted">An diesem Tag nichts erledigt.</p>'}</section>
    ${rows ? `<h2 class="calday">Dran</h2>${rows}` : '<p class="muted">Nichts dran.</p>'}`;
}

function viewHistory() {
  const monthName = asDate(S.today).toLocaleDateString('de-AT', { month: 'long' });
  const head = `<p class="banner">Im ${monthName} erledigt: ${balance(S.dayComps)}</p>`;
  if (!S.history.length) return `${head}<h2>Verlauf</h2><p class="muted">Noch nichts erledigt.</p>`;
  let last = '';
  return head + S.history.map((c) => {
    const d = c.day;
    const head = d !== last ? `<h2>${asDate(d).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h2>` : '';
    last = d;
    const time = new Date(c.at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
    const proxy = c.forPerson && c.forPerson !== c.by;
    return `${head}<div class="hist"><span class="time">${time}</span><div>
      <div>${esc(c.title)}</div>
      <div class="meta">erledigt von ${byName(c.by)}${proxy ? ` für ${esc(person(c.forPerson)?.name ?? '?')} (Vertretung)` : ''}</div>
    </div></div>`;
  }).join('');
}

function viewSettings() {
  const hh = S.hh;
  const opt = (v, l, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`;
  const days = (cur) => Array.from({ length: 31 }, (_, i) => opt(i + 1, `${i + 1}.`, cur)).join('');
  const [a, b] = packageOwners('short', hh, toDay(S.today));

  const persons = hh.persons.map((p, i) => `<div class="setting">
      <label class="field">Person ${i + 1}<input type="text" data-person-name="${i}" value="${esc(p.name)}" maxlength="30"></label>
      <div class="colors">${COLORS.map(([c, l]) => `<button data-person-color="${i}" data-color="${c}" aria-pressed="${p.color === c}"><i class="sw" style="--pc:var(--c-${c})"></i>${l}</button>`).join('')}</div>
    </div>`).join('');

  const rotation = GROUPS.map((g) => `<label class="field">${GROUP_LABEL[g]} – tauschen alle
      <select data-rotation="${g}">${[1, 2, 3, 4, 6, 12, 24].map((n) => opt(n, `${n} ${n === 1 ? 'Monat' : 'Monate'}`, hh.rotation[g])).join('')}</select>
      <span class="small">Nächster Tausch: ${fmtLong(nextSwap(g, hh, S.today))}</span></label>`).join('');

  const tasks = S.tasks.length
    ? S.tasks.slice().sort((x, y) => kindRank(x) - kindRank(y) || (x.order ?? 0) - (y.order ?? 0)).map((t) => `
      <button class="rowbtn" data-edit="${esc(t.id)}"><span>${esc(t.title)}<br><span class="meta">${intervalLabel(t)} · ${ASSIGN_LABEL[t.assign]}${t.season ? ` · Saison ${seasonLabel(t.season)}` : ''}</span></span><span class="meta">Bearbeiten</span></button>`).join('')
    : '<p class="muted">Noch keine Aufgaben.</p>';

  return `
    <h2>Zahl am App-Icon</h2>
    <p class="small">Zeigt, was bei dir nicht geschafft oder jetzt dran ist (ohne Tägliches).</p>
    ${badgeSetting()}

    <h2>Dieses Gerät</h2>
    <p class="small">Ich bin</p>
    <div class="btnrow">${hh.persons.map((p) => `<button class="btn" data-me="${p.id}" aria-pressed="${S.me === p.id}">${esc(p.name)}</button>`).join('')}</div>
    <p class="small">Darstellung</p>
    <div class="btnrow">
      <button class="btn" data-theme-set="dark" aria-pressed="${theme() === 'dark'}">Dunkel</button>
      <button class="btn" data-theme-set="light" aria-pressed="${theme() === 'light'}">Hell</button>
    </div>

    <h2>Haushalt</h2>
    <p class="small">Haushalts-Code – damit tritt die zweite Person bei. Nicht öffentlich teilen.</p>
    <p class="code">${formatCode(S.code)}</p>
    <div class="btnrow"><button class="btn" data-action="copy">Code kopieren</button></div>
    ${S.store.mode === 'local' ? '<p class="small"><span class="ov">Lokaler Testmodus:</span> config.js ist nicht befüllt, Daten liegen nur auf diesem Gerät.</p>' : ''}

    <h2>Personen</h2>
    ${persons}

    <h2>Abwesend (Urlaub, krank)</h2>
    <p class="small">In dieser Zeit pausieren die eigenen Aufgaben: nichts wird „nicht geschafft“. Gemeinsames pausiert nur, wenn beide weg sind.</p>
    ${hh.persons.map((p) => {
      const a = hh.away?.[p.id] || {};
      return `<div class="setting"><p>${pn(p.id)}</p>
        <div class="inline"><label class="field">von<input type="date" data-away-from="${p.id}" value="${esc(a.from || '')}"></label>
          <label class="field">bis<input type="date" data-away-to="${p.id}" value="${esc(a.to || '')}"></label></div>
        ${a.from || a.to ? `<button class="btn" data-away-clear="${p.id}">Abwesenheit löschen</button>` : ''}</div>`;
    }).join('')}

    <h2>Start des Plans</h2>
    <label class="field">Ab diesem Tag zählen die Aufgaben<input type="date" data-start value="${esc(hh.setup)}"></label>
    <p class="small">Standard ist der Tag der Einrichtung. Davor ist nichts „nicht geschafft“. Auch der 2-Wochen-Rhythmus und der Pakettausch zählen ab hier.</p>

    <h2>Unsere Abmachungen</h2>
    <p class="small">Selbstverständliches, das ihr nicht abhaken wollt – z. B. „Geschirr macht, wer nicht kocht“. Eine Abmachung pro Zeile. Steht bei „Heute“ oben zum Aufklappen und zählt nicht in der Bilanz.</p>
    <label class="field"><textarea data-rules rows="5" placeholder="Geschirr macht, wer nicht kocht&#10;Abends kurz aufräumen">${esc((hh.rules || []).join('\n'))}</textarea></label>

    <h2>Aufgaben</h2>
    <div class="btnrow"><button class="btn block" data-edit="">Aufgabe hinzufügen</button></div>
    <div class="rows">${tasks}</div>

    <h2>Rotation</h2>
    <p>Paket A: ${pn(a)} · Paket B: ${pn(b)}</p>
    <p class="small">Pakete tauschen jeweils am Monatsersten, gezählt ab dem Einrichtungsmonat (${fmtLong(hh.setup)}).</p>
    <div class="btnrow"><button class="btn" data-action="flip">Zuteilung umdrehen</button></div>
    ${rotation}

    <h2>Gemeinsamer Tag</h2>
    <p class="small">Halbjährliche und jährliche Aufgaben sind an diesem Tag ihrer Periode fällig.</p>
    <div class="inline"><label class="field">Halbjährlich, Tag<select data-shared="halfyearDay">${days(hh.sharedDay.halfyearDay)}</select></label>
      <label class="field">Monat<select data-shared="halfyearMonth">${[3, 4, 5].map((m) => opt(m, `${MONTHS[m - 1]} / ${MONTHS[m + 5]}`, hh.sharedDay.halfyearMonth)).join('')}</select></label></div>
    <div class="inline"><label class="field">Jährlich, Tag<select data-shared="yearlyDay">${days(hh.sharedDay.yearlyDay)}</select></label>
      <label class="field">Monat<select data-shared="yearlyMonth">${MONTHS.map((m, i) => opt(i + 1, m, hh.sharedDay.yearlyMonth)).join('')}</select></label></div>

    <h2>Abmelden</h2>
    <p class="small">Entfernt den Haushalt nur von diesem Gerät. Mit dem Code kannst du wieder beitreten.</p>
    <div class="btnrow"><button class="btn danger" data-action="leave">Auf diesem Gerät abmelden</button></div>`;
}

function renderWhoAmI() {
  app.innerHTML = `<header class="top">${LOGO}</header>
    <h2>Wer bist du?</h2>
    <p>Einmalig pro Gerät. Deine Aufgaben stehen danach zuerst.</p>
    <div class="btnrow">${S.hh.persons.map((p) => `<button class="btn block" data-me="${p.id}">${pn(p.id)}</button>`).join('')}</div>`;
}

// ---------- Einrichtung ----------

function startSetup() {
  S.setup = { step: 'start', persons: [{ name: '', color: 'blau' }, { name: '', color: 'rosa' }], error: '' };
  renderSetup();
}

function renderSetup() {
  const st = S.setup;
  const err = st.error ? `<p class="ov">${esc(st.error)}</p>` : '';
  const local = S.store?.mode === 'local' ? '<p class="small"><span class="ov">Lokaler Testmodus:</span> config.js ist nicht befüllt.</p>' : '';
  let body = '';
  if (st.step === 'start') {
    body = `<h2>Willkommen</h2>
      <p>Ein Putzplan für zwei. Lege einen Haushalt an oder tritt mit einem Code bei.</p>
      <div class="btnrow"><button class="btn primary block" data-setup="new">Haushalt neu anlegen</button></div>
      <h2>Beitreten</h2>
      <label class="field">Haushalts-Code<input type="text" id="joinCode" class="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX"></label>
      <div class="btnrow"><button class="btn block" data-setup="join">Beitreten</button></div>${err}${local}`;
  } else if (st.step === 'persons') {
    body = `<h2>Schritt 1 von 2 · Personen</h2>
      ${st.persons.map((p, i) => `<div class="setting">
        <label class="field">Name Person ${i + 1}<input type="text" data-setup-name="${i}" value="${esc(p.name)}" maxlength="30"></label>
        <div class="colors">${COLORS.map(([c, l]) => `<button data-setup-color="${i}" data-color="${c}" aria-pressed="${p.color === c}"><i class="sw" style="--pc:var(--c-${c})"></i>${l}</button>`).join('')}</div>
      </div>`).join('')}
      ${err}
      <div class="btnrow"><button class="btn" data-setup="start">Zurück</button><button class="btn primary" data-setup="template">Weiter</button></div>`;
  } else if (st.step === 'template') {
    body = `<h2>Schritt 2 von 2 · Vorlage</h2>
      <div class="rows">
        <button class="rowbtn" data-setup="create-template"><span>Vorschlag für 2 Personen<br><span class="meta">${TEMPLATE.length} Aufgaben (Paket A und B, halbjährlich und jährlich gemeinsam) und ein paar Abmachungen</span></span></button>
        <button class="rowbtn" data-setup="create-empty"><span>Leer starten<br><span class="meta">Aufgaben selbst anlegen</span></span></button>
      </div>${err}
      <div class="btnrow"><button class="btn" data-setup="persons">Zurück</button></div>`;
  } else if (st.step === 'busy') {
    body = '<p class="loading">Einen Moment …</p>';
  } else if (st.step === 'created') {
    body = `<h2>Haushalt angelegt</h2>
      <p>Dein Haushalts-Code:</p>
      <p class="code">${formatCode(S.code)}</p>
      <p class="small">Die zweite Person öffnet Fairplan auf ihrem Gerät und tritt mit diesem Code bei. Du findest ihn jederzeit in den Einstellungen.</p>
      <div class="btnrow"><button class="btn" data-action="copy">Code kopieren</button><button class="btn primary" data-setup="done">Weiter</button></div>`;
  }
  app.innerHTML = `<header class="top">${LOGO}</header>${body}`;
}

async function createHousehold(withTemplate) {
  const st = S.setup;
  const today = localToday();
  const code = newCode();
  const doc = {
    ...DEFAULT_HOUSEHOLD,
    setup: today,
    persons: st.persons.map((p, i) => ({ id: `p${i + 1}`, name: p.name.trim(), color: p.color })),
    rules: withTemplate ? TEMPLATE_RULES : [],
    createdAt: new Date().toISOString(),
  };
  const tasks = withTemplate ? TEMPLATE.map((t, i) => ({ ...t, id: newId(), created: today, order: i })) : [];
  st.step = 'busy'; renderSetup();
  try {
    await S.store.createHousehold(code, doc, tasks);
  } catch (e) {
    console.error(e);
    Object.assign(st, { step: 'template', error: 'Anlegen fehlgeschlagen. Bist du online und ist Firebase eingerichtet?' });
    return renderSetup();
  }
  ls.set('code', code);
  S.code = code;
  st.step = 'created';
  renderSetup();
}

async function joinHousehold() {
  const st = S.setup;
  const code = normalizeCode($('#joinCode').value);
  if (code.length !== 16) { st.error = 'Der Code hat 16 Zeichen.'; return renderSetup(); }
  st.step = 'busy'; renderSetup();
  let hh = null;
  try { hh = await S.store.getHousehold(code); } catch (e) { console.error(e); }
  if (!hh) { Object.assign(st, { step: 'start', error: 'Kein Haushalt mit diesem Code gefunden (oder offline).' }); return renderSetup(); }
  ls.set('code', code);
  S.setup = null;
  connect(code);
}

// ---------- Aktionen ----------

function theme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $('meta[name="theme-color"]').content = t === 'light' ? '#ffffff' : '#18191b';
  ls.set('theme', t);
}

let snackTimer;
function snack(text, undo) {
  const el = $('#snack');
  el.innerHTML = `<span>${text}</span>${undo ? '<button>Rückgängig</button>' : ''}`;
  el.hidden = false;
  if (undo) el.querySelector('button').onclick = () => { el.hidden = true; undo(); };
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

function toggle(input) {
  const task = S.tasks.find((t) => t.id === input.dataset.task);
  if (!task) return;
  const slot = input.dataset.slot || null;
  const it = evaluate(task, S.hh, S.today, S.comps).find((i) => (i.slot ?? null) === slot);
  if (!it?.key) return;
  const id = completionId(task.id, it.key, slot);
  if (input.checked) {
    const data = {
      taskId: task.id, title: task.title, key: it.key, slot, forPerson: it.owner,
      by: S.me, at: new Date().toISOString(), day: S.today,
    };
    input.closest('.item').classList.add('leaving');
    setTimeout(() => S.store.setCompletion(S.code, id, data), 180);
    const proxy = it.owner && it.owner !== S.me ? ` für ${esc(person(it.owner).name)}` : '';
    snack(`Erledigt${proxy}.`, () => S.store.removeCompletion(S.code, id));
  } else {
    const prev = S.comps.get(id);
    S.store.removeCompletion(S.code, id);
    snack('Wieder offen.', prev ? () => S.store.setCompletion(S.code, id, prev) : null);
  }
}

async function copyCode() {
  const text = formatCode(S.code);
  try { await navigator.clipboard.writeText(text); snack('Code kopiert.'); } catch { snack(`Code: ${text}`); }
}

function updateHH(patch) { S.store.updateHousehold(S.code, patch); }

app.addEventListener('click', (e) => {
  const el = e.target.closest('button, [data-action]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.view) {
    if (d.view === 'kalender') { S.calMonth = null; S.calDay = null; }
    S.view = d.view; window.scrollTo(0, 0); return render();
  }
  if (d.filter) { S.filter = d.filter; return render(); }
  if (d.awayClear) return updateHH({ away: { ...(S.hh.away || {}), [d.awayClear]: {} } });
  if (d.calDay) { S.calDay = d.calDay; S.calMonth = d.calDay.slice(0, 7); return render(); }
  if (d.calMonth) {
    const [y, m] = (S.calMonth || S.today.slice(0, 7)).split('-').map(Number);
    const t = new Date(y, m - 1 + +d.calMonth, 1);
    S.calMonth = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    S.calDay = S.calMonth === S.today.slice(0, 7) ? null : `${S.calMonth}-01`;
    return render();
  }
  if (d.me) { S.me = d.me; ls.set('me', d.me); return render(); }
  if (d.themeSet) { setTheme(d.themeSet); return render(); }
  if (d.edit !== undefined && el.matches('[data-edit]')) return openEditor(d.edit);
  if (d.personColor) {
    const persons = S.hh.persons.map((p, i) => (i === +d.personColor ? { ...p, color: d.color } : p));
    return updateHH({ persons });
  }
  if (d.setupColor) { S.setup.persons[+d.setupColor].color = d.color; return renderSetup(); }
  if (d.setup) return setupAction(d.setup);
  switch (d.action) {
    case 'copy': return copyCode();
    case 'badge':
      Notification.requestPermission().then(() => { lastBadge = -1; render(); }).catch(() => {});
      return;
    case 'flip': updateHH({ swapped: !S.hh.swapped }); return snack('Zuteilung umgedreht.');
    case 'leave':
      if (!confirm('Haushalt auf diesem Gerät abmelden?')) return;
      ls.set('code', null); ls.set('me', null); location.reload();
  }
});

function setupAction(a) {
  const st = S.setup;
  st.error = '';
  if (a === 'new' || a === 'persons') st.step = 'persons';
  else if (a === 'start') st.step = 'start';
  else if (a === 'template') {
    if (st.persons.some((p) => !p.name.trim())) st.error = 'Bitte beide Namen eingeben.';
    else st.step = 'template';
  } else if (a === 'create-template') return createHousehold(true);
  else if (a === 'create-empty') return createHousehold(false);
  else if (a === 'join') return joinHousehold();
  else if (a === 'done') { S.setup = null; connect(S.code); return; }
  renderSetup();
}

app.addEventListener('change', (e) => {
  const el = e.target;
  const d = el.dataset;
  if (d.action === 'toggle') return toggle(el);
  if (d.personName !== undefined) {
    const name = el.value.trim();
    if (!name) return render();
    const persons = S.hh.persons.map((p, i) => (i === +d.personName ? { ...p, name } : p));
    return updateHH({ persons });
  }
  if (d.rotation) return updateHH({ rotation: { ...S.hh.rotation, [d.rotation]: +el.value } });
  if (d.start !== undefined) {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(el.value) && el.value !== S.hh.setup
      && confirm('Start ändern? Der 2-Wochen-Rhythmus und der Pakettausch verschieben sich mit. Schon Abgehaktes im laufenden 2-Wochen-Block kann dadurch wieder offen erscheinen.');
    if (ok) { updateHH({ setup: el.value }); snack('Start geändert.'); }
    else el.value = S.hh.setup;
    return render();
  }
  if (d.awayFrom || d.awayTo) {
    const id = d.awayFrom || d.awayTo;
    const cur = { ...(S.hh.away?.[id] || {}), [d.awayFrom ? 'from' : 'to']: el.value };
    if (cur.from && !cur.to) cur.to = cur.from;
    if (cur.to && !cur.from) cur.from = cur.to;
    if (cur.from && cur.to && cur.to < cur.from) [cur.from, cur.to] = [cur.to, cur.from];
    return updateHH({ away: { ...(S.hh.away || {}), [id]: cur } });
  }
  if (d.rules !== undefined) {
    const rules = el.value.split('\n').map((r) => r.trim()).filter(Boolean).slice(0, 50);
    updateHH({ rules });
    return snack('Abmachungen gespeichert.');
  }
  if (d.shared) return updateHH({ sharedDay: { ...S.hh.sharedDay, [d.shared]: +el.value } });
});

// Auf-/Zuklappen merken (toggle blubbert nicht, daher capture)
app.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d.dataset?.fold) S.open[d.dataset.fold] = d.open;
}, true);

app.addEventListener('input', (e) => {
  const d = e.target.dataset;
  if (d.setupName !== undefined) S.setup.persons[+d.setupName].name = e.target.value;
});

// ---------- Aufgabe bearbeiten ----------

const sheet = $('#sheet');

function openEditor(id) {
  const t = S.tasks.find((x) => x.id === id) || { n: 1, unit: 'week', assign: 'A', title: '', note: '', season: null };
  const isNew = !t.id;
  const kind = kindOf(t);
  const opt = (v, l, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`;
  const months = (cur) => MONTHS.map((m, i) => opt(i + 1, m, cur)).join('');
  sheet.innerHTML = `<form id="taskForm" novalidate>
    <header class="top"><h1>${isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten'}</h1></header>
    <label class="field">Titel<input type="text" name="title" value="${esc(t.title)}" maxlength="120"></label>
    <label class="field">Hinweis (optional)<input type="text" name="note" value="${esc(t.note)}" maxlength="200"></label>
    <label class="field">Intervall<select name="kind">${KINDS.map((k) => opt(k, k === 'custom' ? 'Eigenes: alle X Tage/Wochen/Monate' : KIND_LABEL[k], kind)).join('')}</select></label>
    <div class="inline" data-custom><span>alle</span><input type="number" name="n" min="1" max="999" value="${t.n}" inputmode="numeric">
      <select name="unit">${Object.entries(UNIT_LABEL).map(([u, l]) => opt(u, l[1], t.unit)).join('')}</select></div>
    <label class="field" data-day>Tag<select name="wd">${opt('', 'Egal – die ganze Woche', t.wd ?? '')}${WEEKDAYS_LONG.map((w, i) => opt(i, `am ${w}`, t.wd ?? '')).join('')}</select></label>
    <label class="field" data-wk>Welche Woche<select name="wk">${opt(0, 'A', t.wk ? 1 : 0)}${opt(1, 'B', t.wk ? 1 : 0)}</select></label>
    <p class="small" data-next></p>
    <label class="field">Zuteilung<select name="assign">${Object.entries(ASSIGN_LABEL).map(([v, l]) => opt(v, v === 'A' || v === 'B' ? `${l} (rotiert)` : v === 'shared' ? `${l} (jede/r darf abhaken)` : v === 'alternate' ? `${l} (jede Periode die andere Person)` : l, t.assign)).join('')}</select></label>
    <label class="cb"><input type="checkbox" name="hasSeason" ${t.season ? 'checked' : ''}> Nur in einer Saison</label>
    <div class="inline" data-season><select name="from">${months(t.season?.from ?? 3)}</select><span>bis</span><select name="to">${months(t.season?.to ?? 10)}</select></div>
    <p class="small" data-hint></p>
    <p class="ov" data-error></p>
    <div class="btnrow"><button type="submit" class="btn primary">Speichern</button><button type="button" class="btn" data-close>Abbrechen</button></div>
    ${isNew ? '' : '<div class="btnrow"><button type="button" class="btn danger block" data-delete>Aufgabe löschen</button></div>'}
  </form>`;
  sheet.hidden = false;
  document.body.style.overflow = 'hidden';
  const form = $('#taskForm');
  const f = form.elements;
  // Entwurf aus dem Formular, für die Vorschau der nächsten Termine
  const draft = (over = {}) => {
    const k = f.kind.value;
    const iv = k === 'custom' ? { n: Math.max(1, Math.min(999, parseInt(f.n.value, 10) || 1)), unit: f.unit.value } : PRESETS[k];
    const day = k === 'weekly' || k === 'biweekly';
    return {
      id: 'x', ...iv, assign: f.assign.value, season: f.hasSeason.checked ? { from: +f.from.value, to: +f.to.value } : null,
      wd: day && f.wd.value !== '' ? +f.wd.value : null, wk: k === 'biweekly' ? +f.wk.value : 0,
      created: t.created || S.today, ...over,
    };
  };
  const upcoming = (task, n) => windowsBetween(task, S.hh, S.today, fromDay(toDay(S.today) + 400))
    .filter((w, i, a) => w.end >= S.today && a.findIndex((x) => x.key === w.key) === i).slice(0, n);
  const sync = () => {
    const k = f.kind.value;
    const day = k === 'weekly' || k === 'biweekly';
    $('[data-day]', form).hidden = !day;
    $('[data-wk]', form).hidden = k !== 'biweekly';
    if (k === 'biweekly') {
      [...f.wk.options].forEach((o, i) => {
        const w = upcoming(draft({ wk: i }), 1)[0];
        o.textContent = w ? `erstmals ${w.start === w.end ? fmtWd(w.start) : `${fmtWd(w.start)}–${fmtWd(w.end)}`}` : (i ? 'B' : 'A');
      });
    }
    const next = upcoming(draft(), 3).map((w) => (w.start === w.end ? fmtWd(w.start) : `${fmtWd(w.start)}–${fmtWd(w.end)}`));
    $('[data-next]', form).textContent = next.length && k !== 'daily' ? `Nächste Termine: ${next.join(' · ')}` : '';
    $('[data-custom]', form).hidden = k !== 'custom';
    $('[data-season]', form).hidden = !f.hasSeason.checked;
    $('[data-hint]', form).textContent = k === 'asneeded'
      ? 'Bei Bedarf: kein fixer Rhythmus, nie „nicht geschafft“. Einfach abhaken, wenn erledigt – zählt trotzdem im Verlauf und Kalender.'
      : k === 'halfyear'
      ? 'Halbjährlich = Frühjahr (März–Mai) und Herbst (Sept.–Nov.), fällig am gemeinsamen Tag.'
      : k === 'yearly' ? 'Fällig am gemeinsamen Tag.' : '';
  };
  sync();
  f.kind.addEventListener('change', () => {
    if (isNew && (f.kind.value === 'halfyear' || f.kind.value === 'yearly')) f.assign.value = 'shared';
    sync();
  });
  f.hasSeason.addEventListener('change', sync);
  for (const el of [f.wd, f.wk, f.n, f.unit, f.from, f.to]) el.addEventListener('change', sync);
  $('[data-close]', form).onclick = closeEditor;
  const del = $('[data-delete]', form);
  if (del) del.onclick = () => {
    if (!confirm(`„${t.title}“ löschen?`)) return;
    S.store.deleteTask(S.code, t.id);
    closeEditor();
    snack('Aufgabe gelöscht.');
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const title = f.title.value.trim();
    const k = f.kind.value;
    const iv = k === 'custom' ? { n: Math.max(1, Math.min(999, parseInt(f.n.value, 10) || 1)), unit: f.unit.value } : PRESETS[k];
    if (!title) { $('[data-error]', form).textContent = 'Bitte einen Titel eingeben.'; return; }
    if (k === 'asneeded' && f.assign.value === 'alternate') f.assign.value = 'shared';
    const task = {
      id: t.id || newId(),
      title,
      note: f.note.value.trim(),
      ...iv,
      assign: f.assign.value,
      season: f.hasSeason.checked ? { from: +f.from.value, to: +f.to.value } : null,
      wd: (k === 'weekly' || k === 'biweekly') && f.wd.value !== '' ? +f.wd.value : null,
      wk: k === 'biweekly' ? +f.wk.value : 0,
      created: t.created || S.today,
      order: t.order ?? Math.max(-1, ...S.tasks.map((x) => x.order ?? 0)) + 1,
    };
    S.store.saveTask(S.code, task);
    closeEditor();
    snack('Gespeichert.');
  };
  f.title.focus();
}

function closeEditor() {
  sheet.hidden = true;
  sheet.innerHTML = '';
  document.body.style.overflow = '';
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeEditor(); });
