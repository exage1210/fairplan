import {
  KINDS, PRESETS, kindOf, evaluate, relevantKeys, completionId,
  localToday, toDay, fromDay, windowsBetween, awayDuring,
  monthlyMinutes, loadByPerson, autoSplit, spreadPositions, weeksPerPeriod, holidays,
} from './logic.js';
import { openStore, newCode, newId, normalizeCode, formatCode } from './store.js';
import { TEMPLATE, TEMPLATE_RULES } from './template.js';

// ---------- Konstanten & Hilfen ----------

const COLORS = [
  ['blau', 'Blau'], ['rosa', 'Rosa'], ['gelb', 'Gelb'],
  ['gruen', 'Grün'], ['violett', 'Violett'], ['orange', 'Orange'],
];
const KIND_LABEL = {
  daily: 'Täglich', weekly: 'Wöchentlich', biweekly: 'Alle 2 Wochen', monthly: 'Monatlich',
  quarterly: 'Vierteljährlich', halfyear: 'Halbjährlich', yearly: 'Jährlich', custom: 'Eigenes Intervall',
  asneeded: 'Bei Bedarf',
};
const SHORT_KIND = {
  daily: 'täglich', weekly: 'wöchentlich', biweekly: '2 Wochen', monthly: 'monatlich',
  quarterly: 'vierteljährlich', halfyear: 'halbjährlich', yearly: 'jährlich', asneeded: 'bei Bedarf',
};
const ASSIGN_LABEL = { A: 'Person 1', B: 'Person 2', shared: 'Gemeinsam', each: 'Pro Person', alternate: 'Abwechselnd' };
// Zuteilung mit Namen: Paket A = Person 1, Paket B = Person 2 (fix)
const assignLabel = (a) => (a === 'A' || a === 'B' ? esc(S.hh?.persons[a === 'A' ? 0 : 1]?.name ?? ASSIGN_LABEL[a]) : ASSIGN_LABEL[a]);
const UNIT_LABEL = { day: ['Tag', 'Tage'], week: ['Woche', 'Wochen'], month: ['Monat', 'Monate'] };
const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString('de-AT', { month: 'long' }));
const DEFAULT_HOUSEHOLD = {
  swapped: false,
  sharedDays: [5], // gemeinsamer Putztag: Samstag
};

const LOGO = '<h1 class="logo">fairplan</h1>';
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
  const day = Number.isInteger(t.day) ? ` · fest am ${WEEKDAYS[t.day]}` : '';
  return (k === 'custom' ? `Alle ${t.n} ${UNIT_LABEL[t.unit][t.n === 1 ? 0 : 1]}` : KIND_LABEL[k]) + day;
};
const seasonLabel = (s) => `${MONTHS[s.from - 1]}–${MONTHS[s.to - 1]}`;
const rangeLabel = (a, b) => (a === b ? fmtDate(a) : `${fmtDate(a)}–${fmtDate(b)}`);
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const weekdayOf = (s) => (asDate(s).getDay() + 6) % 7; // Mo=0
const fmtWd = (s) => `${WEEKDAYS[weekdayOf(s)]} ${fmtDate(s)}`;
// Kurz relativ zu heute: Wochentag in dieser Woche bzw. in den letzten 6 Tagen, sonst „Mo 2.11.“
function dayLabel(s) {
  const diff = toDay(s) - toDay(S.today);
  if (diff === 0) return 'heute';
  if (diff === -1) return 'gestern';
  return diff >= -6 && s <= weekEnd() ? WEEKDAYS[weekdayOf(s)] : fmtWd(s);
}
const weekEnd = () => fromDay(toDay(S.today) + 6 - weekdayOf(S.today)); // Sonntag dieser Woche

// ---------- Zustand ----------

const S = {
  store: null,
  code: ls.get('code'),
  me: ls.get('me'),
  view: 'heute',
  filter: 'all',
  kindFilter: 'all',
  calMonth: null, // 'YYYY-MM', null = aktueller Monat
  calDay: null, // Tag im offenen Panel, null = Panel zu
  panelAnim: false, // Panel beim Öffnen einmal hereinfahren lassen
  today: localToday(),
  hh: undefined, // undefined = lädt, null = nicht gefunden
  tasks: [],
  tasksLoaded: false,
  comps: new Map(),
  setup: null,
  subs: [],
  compSub: null,
  compSig: '',
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
  // Einladungslink ?join=CODE
  const join = normalizeCode(new URLSearchParams(location.search).get('join') || '');
  if (standalone()) history.replaceState(null, '', location.pathname);
  if (join.length === 16 && join !== S.code
    && (!S.code || confirm('Diesem Haushalt beitreten? Der bisherige wird auf diesem Gerät abgemeldet.'))) {
    ls.set('me', null);
    S.me = null;
    startSetup();
    joinHousehold(join);
  } else if (S.code) connect(S.code);
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

// Abmachungen: täglich abhakbar, eine Checkbox für beide. Kennung aus dem Text, damit Umsortieren nichts verschiebt.
const ruleKey = () => `rule:${S.today}`;
function ruleId(text) {
  let h = 5381;
  for (const ch of text) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0;
  return `rule-${h.toString(36)}`;
}

// Nur die Erledigungen der aktuellen und vorherigen Perioden laden (spart Lesezugriffe)
function refreshCompletions() {
  if (!S.hh || !S.tasksLoaded) return;
  const keys = [...relevantKeys(S.tasks, S.hh, S.today), ruleKey()];
  const sig = keys.join('|');
  if (sig === S.compSig) return;
  S.compSig = sig;
  S.compSub?.();
  S.compSub = S.store.watchCompletions(S.code, keys, (m) => { S.comps = m; render(); });
}

// Erledigungen für den sichtbaren Kalenderzeitraum laden; null = abmelden
function watchDays(range) {
  const sig = range ? range.join('|') : '';
  if (sig === S.daySig) return;
  S.daySig = sig;
  S.daySub?.();
  S.daySub = null;
  S.dayComps = [];
  if (range) S.daySub = S.store.watchDays(S.code, range[0], range[1], (list) => { S.dayComps = list.filter((c) => c.step == null); render(); });
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

  const views = { heute: viewToday, alle: viewAll, kalender: viewCalendar, einstellungen: viewSettings };
  watchDays(S.view === 'kalender' ? calRange() : null);
  const tab = S.view;
  const tabs = [['heute', 'Aktuell'], ['alle', 'Alle'], ['kalender', 'Kalender'], ['einstellungen', 'Optionen']]
    .map(([v, l]) => `<button data-view="${v}" ${tab === v ? 'aria-current="page"' : ''}>${l}</button>`).join('');
  const scroll = window.scrollY;
  app.innerHTML = `<header class="top">${LOGO}</header>
    ${views[S.view]()}
    <nav class="tabs">${tabs}</nav>`;
  window.scrollTo(0, scroll);
  fillQr();
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
  const extra = t.assign === 'each' ? ' · pro Person' : t.assign === 'alternate' ? ' · abwechselnd' : '';
  return `${pn(it.owner)}${extra}`;
}

function statusText(it) {
  const c = it.completion;
  switch (it.status) {
    case 'overdue': return lateText(it);
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
  const meta = [first, statusText(it), lead === 'owner' && it.task.min ? `${it.task.min} Min` : ''].filter(Boolean).join(' · ');
  const cls = [it.status, active ? '' : 'inactive'].join(' ');
  return `<div class="item ${cls}" style="--pc:${p ? `var(--c-${p.color})` : 'var(--shared)'}">
    <label class="check"><input type="checkbox" data-action="toggle" data-task="${esc(it.task.id)}" data-slot="${esc(it.slot ?? '')}"
      ${it.status === 'done' ? 'checked' : ''} ${active ? '' : 'disabled'} aria-label="${esc(it.task.title)} erledigt"><span class="box"></span></label>
    <div class="body"><div class="title">${esc(it.task.title)}</div>
      ${it.task.note ? `<div class="note">${esc(it.task.note)}</div>` : ''}
      ${meta ? `<div class="meta">${meta}</div>` : ''}</div>
  </div>`;
}

// Vergessenes: neutral, nur der Hinweis in gedämpftem Rot – und das nur bei eigenen/gemeinsamen Aufgaben
const lateText = (it) => `<span class="${it.owner === S.me || it.owner === null ? 'late' : ''}">seit ${dayLabel(it.end)} offen</span>`;

// Termin-Zusatz für „Aktuell“: „seit … offen“, „bis Sa“, „ab Mo 2.11.“ – bei „Heute“ nichts
function whenText(it) {
  if (it.status === 'overdue') return lateText(it);
  if (it.status === 'upcoming') return `${dayLabel(it.due)}, bis ${dayLabel(it.end)}`;
  if (it.status === 'idle' && it.next) return `ab ${dayLabel(it.next)}`;
  if (it.status === 'due' && it.end > S.today) return `bis ${dayLabel(it.end)}`;
  return '';
}

// Zeile für „Aktuell“: Intervall klein rechts, Zusatzzeile nur für Hinweis oder Termin.
// Offene Zeilen lassen sich nach rechts wischen (= abhaken).
function nowRow(it, sub = '') {
  const p = person(it.owner);
  const t = it.task, k = kindOf(t);
  const iv = k === 'custom' ? `alle ${t.n} ${UNIT_LABEL[t.unit][t.n === 1 ? 0 : 1]}` : SHORT_KIND[k];
  const done = it.status === 'done';
  const off = !it.key; // nächster Termin liegt in einer späteren Periode → noch nicht abhakbar
  const extra = [t.note ? esc(t.note) : '', sub].filter(Boolean).join(' · ');
  return `<div class="item ${done ? 'done' : ''}" ${done || off ? '' : 'data-swipe'} style="--pc:${p ? `var(--c-${p.color})` : 'var(--shared)'}">
    <label class="check"><input type="checkbox" data-action="toggle" data-task="${esc(t.id)}" data-slot="${esc(it.slot ?? '')}"
      ${done ? 'checked' : ''} ${off ? 'disabled' : ''} aria-label="${esc(t.title)} erledigt"><span class="box"></span></label>
    <div class="body"><div class="head"><span class="title">${esc(t.title)}</span><span class="kind">${iv}</span></div>
      ${extra ? `<div class="meta">${extra}</div>` : ''}${stepsBlock(it)}</div>
  </div>`;
}

// Ein/Aus-Schalter mit einem Satz Erklärung
const switchRow = (key, on, label, hint) => `<label class="cb"><input type="checkbox" data-switch="${key}" ${on ? 'checked' : ''}> ${label}</label>
  <p class="small">${hint}</p>`;

// Vorgeschlagene Abmachungen als Knöpfe zum An-/Abwählen
const ruleChips = (picked, attr) => `<div class="filters">${TEMPLATE_RULES.map((r) =>
  `<button ${attr}="${esc(r)}" aria-pressed="${picked.includes(r)}">${esc(r)}</button>`).join('')}</div>`;
const ownRules = () => (S.hh.rules || []).filter((r) => !TEMPLATE_RULES.includes(r));
const toggled = (list, x) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

// Abmachung als Zeile: graue Checkbox, abgehakt bleibt sie stehen und zeigt, wer's erledigt hat
function ruleRow(text) {
  const c = S.comps.get(completionId(ruleId(text), ruleKey(), null));
  return `<div class="item ${c ? 'done' : ''}" style="--pc:var(--shared)">
    <label class="check"><input type="checkbox" data-action="toggle-rule" data-rule="${esc(text)}" ${c ? 'checked' : ''}
      aria-label="${esc(text)} erledigt"><span class="box"></span></label>
    <div class="body"><div class="head"><span class="title">${esc(text)}</span><span class="kind">täglich</span></div>
      ${c ? `<div class="meta">erledigt von ${byName(c.by)}</div>` : ''}</div>
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


// Zahl am App-Icon: nicht Geschafftes + jetzt dran (eigenes und gemeinsames), ohne Tägliches
function badgeCount() {
  return allItems().filter((i) => (i.owner === S.me || i.owner === null) && kindOf(i.task) !== 'daily'
    && (i.status === 'overdue' || i.status === 'due')).length;
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
  const mine = (i) => i.owner === S.me || i.owner === null;
  const open = items.filter((i) => i.status === 'due' || i.status === 'overdue' || i.status === 'upcoming');
  const byDate = (key) => (a, b) => (a[key] || '').localeCompare(b[key] || '')
    || kindRank(a.task) - kindRank(b.task) || (a.task.order ?? 0) - (b.task.order ?? 0);
  const sun = weekEnd();

  // Gruppiert nach Termin: Noch offen (vergessen) · Heute (jetzt dran) · Diese Woche (Termin bis So) · Später
  const late = open.filter((i) => mine(i) && i.status === 'overdue').sort(byDate('end'));
  const today = open.filter((i) => mine(i) && i.status === 'due').sort(byDate('end'));
  const week = open.filter((i) => mine(i) && i.status === 'upcoming' && i.due <= sun).sort(byDate('due'));
  // Später: was nach Sonntag noch in dieser Periode kommt, dazu die nächsten Termine der kommenden 2 Wochen
  const soon = fromDay(toDay(S.today) + 14);
  const later = [
    ...open.filter((i) => mine(i) && i.status === 'upcoming' && i.due > sun),
    ...items.filter((i) => mine(i) && i.status === 'idle' && i.next && i.next <= soon && kindOf(i.task) !== 'daily')
      .map((i) => ({ ...i, due: i.next })),
  ].sort(byDate('due'));
  const need = sortItems(items.filter((i) => mine(i) && (i.status === 'need' || (i.status === 'done' && kindOf(i.task) === 'asneeded'))));
  const doneToday = items.filter((i) => i.status === 'done' && i.completion?.day === S.today && kindOf(i.task) !== 'asneeded');

  // Als Nächstes (für „Alles erledigt“): erste aus „Später“, sonst die früheste kommende eigene oder gemeinsame Aufgabe
  const next = items.filter((i) => mine(i) && kindOf(i.task) !== 'daily' && kindOf(i.task) !== 'asneeded')
    .map((i) => ({ title: i.task.title, date: i.status === 'upcoming' ? i.due : i.next }))
    .filter((n) => n.date && n.date > S.today).sort((a, b) => a.date.localeCompare(b.date))[0];

  const upNext = later[0] ? `${esc(later[0].task.title)}, ${whenText(later[0])}`
    : next ? `${esc(next.title)}, ab ${dayLabel(next.date)}` : '';

  const away = S.hh.away?.[S.me];
  const meAway = away?.from && away.from <= S.today && S.today <= away.to;
  const banner = meAway
    ? `Du bist bis ${fmtDate(away.to)} als abwesend eingetragen. Deine Aufgaben pausieren.`
    : late.length || today.length || week.length
      ? `Heute ${today.length} · Diese Woche ${week.length}${late.length ? ` · <span class="late">${late.length}</span> noch offen` : ''}`
      : `Alles erledigt.${upNext ? `<div class="small">Als Nächstes: ${upNext}</div>` : ''}`;

  const group = (title, list, sub = whenText) => (list.length
    ? `<section class="group"><h2>${title}<span class="count">${list.length}</span></h2>
      <div class="list">${list.map((i) => nowRow(i, sub(i))).join('')}</div></section>` : '');
  const rows = (list, sub = whenText) => `<div class="list">${list.map((i) => nowRow(i, sub(i))).join('')}</div>`;

  // Andere Personen: ganz unten eingeklappt, je eine Zeile; abhaken = Vertretung
  const others = S.hh.persons.filter((p) => p.id !== S.me).map((p) => {
    const list = open.filter((i) => i.owner === p.id && i.status !== 'upcoming')
      .sort((a, b) => (a.status === 'overdue' ? 0 : 1) - (b.status === 'overdue' ? 0 : 1) || byDate('end')(a, b));
    return list.length ? fold(`other-${p.id}`, `<span>${pn(p.id)}: ${list.length} offen</span>`, rows(list)) : '';
  }).join('');

  const rules = (S.hh.rules || []).filter(Boolean);
  return `<div class="banner now">${banner}</div>
    ${rules.length ? `<section class="group"><h2>Abmachungen<span class="count">${rules.filter((r) => S.comps.has(completionId(ruleId(r), ruleKey(), null))).length}/${rules.length}</span></h2>
      <div class="list">${rules.map(ruleRow).join('')}</div></section>` : ''}
    ${group('Noch offen', late)}
    ${group('Heute', today)}
    ${group('Diese Woche', week)}
    ${later.length ? fold('later', `Später <span class="count">${later.length}</span>`, rows(later)) : ''}
    ${need.length ? fold('need', `Bei Bedarf <span class="count">${need.length}</span>`, rows(need, () => '')) : ''}
    ${doneToday.length ? fold('done', `Heute erledigt <span class="count">${doneToday.length}</span>`, rows(doneToday, statusText)) : ''}
    ${others}`;
}

function filterBar() {
  const [p1, p2] = S.hh.persons;
  const f = S.filter;
  return [['all', 'Alle'], [p1.id, p1.name], [p2.id, p2.name], ['shared', 'Gemeinsam']]
    .map(([v, l]) => `<button data-filter="${esc(v)}" aria-pressed="${f === v}">${esc(l)}</button>`).join('');
}

function kindBar() {
  return [['all', 'Alle Intervalle'], ...KINDS.filter((k) => S.tasks.some((t) => kindOf(t) === k)).map((k) => [k, KIND_LABEL[k]])]
    .map(([v, l]) => `<button data-kind-filter="${v}" aria-pressed="${S.kindFilter === v}">${esc(l)}</button>`).join('');
}

function viewAll() {
  const f = S.filter, kf = S.kindFilter;
  const items = allItems().filter((i) => (f === 'all' || (f === 'shared' ? i.owner === null : i.owner === f))
    && (kf === 'all' || kindOf(i.task) === kf));
  const groups = KINDS.map((k) => {
    const g = sortItems(items.filter((i) => kindOf(i.task) === k));
    return g.length ? section(KIND_LABEL[k], g, { lead: 'owner' }) : '';
  }).join('');
  return `<div class="filters">${filterBar()}</div><div class="filters">${kindBar()}</div>
    ${groups || '<p class="muted" style="margin-top:24px">Keine Aufgaben.</p>'}`;
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

// Monatsraster ab Montag: pro Tag ein Punkt je Person, die etwas erledigt hat.
// Optional („Geplantes anzeigen“): Ringe = ab diesem Tag ist etwas dran (Farbe = wer).
// Ringe nur ab heute und nie vor dem Start des Plans.
// Oben die Monatsbilanz, darunter der Verlauf des Monats. Tag antippen öffnet ein Panel von unten.
function viewCalendar() {
  const month = S.calMonth || S.today.slice(0, 7);
  const [from, to] = calRange();
  const gridStart = toDay(from), gridEnd = toDay(to);
  const plan = ls.get('plan') === '1';

  const doneOn = new Map();
  for (const c of S.dayComps) { if (!doneOn.has(c.day)) doneOn.set(c.day, []); doneOn.get(c.day).push(c); }
  const wins = plan || S.calDay ? S.tasks.flatMap((t) => windowsBetween(t, S.hh, from, to)) : [];
  const starts = new Map();
  for (const w of wins) {
    if (kindOf(w.task) === 'daily') continue;
    if (!starts.has(w.start)) starts.set(w.start, new Set());
    starts.get(w.start).add(w.owner);
  }

  const hol = new Map([...holidays(+from.slice(0, 4)), ...holidays(+to.slice(0, 4))]);
  const cells = [];
  for (let d = gridStart; d <= gridEnd; d++) {
    const ds = fromDay(d);
    const done = doneOn.get(ds) || [];
    const dots = S.hh.persons.filter((p) => done.some((c) => c.by === p.id))
      .map((p) => `<i style="--pc:var(--c-${p.color})"></i>`).join('')
      + (plan && ds >= S.today && ds >= S.hh.setup ? [...(starts.get(ds) || [])].map((o) => `<i class="plan" style="--pc:${colorOf(o)}"></i>`).join('') : '');
    const cls = [ds.slice(0, 7) !== month ? 'out' : '', ds === S.today ? 'today' : '', ds === S.calDay ? 'sel' : '', hol.has(ds) ? 'holiday' : ''].join(' ');
    cells.push(`<button class="day ${cls}" data-cal-day="${ds}" ${hol.has(ds) ? `title="${esc(hol.get(ds))}"` : ''}><span>${asDate(ds).getDate()}</span><span class="dots">${dots}</span></button>`);
  }

  // Monatsbilanz: eine Zeile, darunter zwei dünne Balken in den Personenfarben
  const monthComps = S.dayComps.filter((c) => c.day.startsWith(month));
  const counts = S.hh.persons.map((p) => [p, monthComps.filter((c) => c.by === p.id).length]);
  const bars = monthComps.length
    ? counts.filter(([, n]) => n).map(([p, n]) => `<i style="flex:${n};--pc:var(--c-${p.color})"></i>`).join('')
    : '<i class="empty"></i>';
  const monthName = asDate(`${month}-01`).toLocaleDateString('de-AT', { month: 'long' });

  // Verlauf des Monats, neueste zuerst
  let last = '';
  const hist = monthComps.slice().sort((a, b) => b.at.localeCompare(a.at)).map((c) => {
    const head = c.day !== last ? `<h2>${asDate(c.day).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>` : '';
    last = c.day;
    return head + histRow(c);
  }).join('');

  const title = asDate(`${month}-01`).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
  return `<div class="calhead">
      <button class="navbtn" data-cal-month="-1" aria-label="Voriger Monat">‹</button>
      <strong>${title}</strong>
      <button class="navbtn" data-cal-month="1" aria-label="Nächster Monat">›</button>
    </div>
    <div class="bal"><div class="small">Im ${esc(monthName)} erledigt: ${counts.map(([p, n]) => `${byName(p.id)} ${n}`).join(' · ')}</div>
      <div class="bal-bar">${bars}</div></div>
    <div class="cal-grid">${WEEKDAYS.map((w) => `<span class="wd">${w}</span>`).join('')}${cells.join('')}</div>
    <label class="cb"><input type="checkbox" data-action="plan" ${plan ? 'checked' : ''}> Geplantes anzeigen</label>
    <h2 class="hist-title">Verlauf</h2>
    ${hist || '<p class="muted">In diesem Monat noch nichts erledigt.</p>'}
    <p class="small">Feiertage sind im Kalender umrandet.</p>
    ${S.calDay ? dayPanel(S.calDay, wins, doneOn, hol.get(S.calDay)) : ''}`;
}

function histRow(c) {
  const time = new Date(c.at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  const proxy = c.forPerson && c.forPerson !== c.by ? ` für ${esc(person(c.forPerson)?.name ?? '?')}` : '';
  return `<div class="hist"><span class="time">${time}</span><div><div>${esc(c.title)}</div>
    <div class="meta">${byName(c.by)}${proxy}</div></div></div>`;
}

// Panel von unten für einen Tag: was erledigt wurde (wer, wann, für wen) und was offen blieb bzw. dran ist
function dayPanel(sel, wins, doneOn, holiday) {
  const doneById = new Map([...S.comps, ...S.dayComps.map((c) => [c.id, c])]);
  const isDone = (w) => doneById.has(completionId(w.task.id, w.key, w.slot));
  const done = (doneOn.get(sel) || []).slice().sort((a, b) => a.at.localeCompare(b.at));
  const past = sel < S.today;
  // Vergangen: was an diesem Tag fällig war und nicht erledigt wurde. Heute/später: was an diesem Tag dran ist.
  const open = wins.filter((w) => kindOf(w.task) !== 'daily' && !isDone(w) && !paused(w)
    // nur Zeitfenster, die im geladenen Zeitraum beginnen – sonst fehlt evtl. die Erledigung
    && (past ? w.end === sel && w.start >= calRange()[0] : w.start <= sel && sel <= w.end))
    .sort((a, b) => a.end.localeCompare(b.end) || kindRank(a.task) - kindRank(b.task));
  const openRows = open.map((w) => `<div class="hist"><i class="sw" style="--pc:${colorOf(w.owner)}"></i><div><div>${esc(w.task.title)}</div>
    <div class="meta">${w.owner === null ? 'Gemeinsam' : esc(person(w.owner)?.name ?? '')}${past ? '' : ` · bis ${dayLabel(w.end)}`}</div></div></div>`).join('');
  const title = asDate(sel).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
  return `<div class="panel-bg${S.panelAnim ? ' anim' : ''}" data-cal-close></div>
    <div class="panel${S.panelAnim ? ' anim' : ''}" role="dialog" aria-label="${esc(title)}">
      <div class="panel-head"><strong>${esc(title)}</strong><button class="navbtn" data-cal-close aria-label="Schließen">×</button></div>
      ${holiday ? `<p class="small">Feiertag: ${esc(holiday)}</p>` : ''}
      <h2>Erledigt<span class="count">${done.length}</span></h2>
      ${done.map(histRow).join('') || '<p class="muted">Nichts erledigt.</p>'}
      ${open.length ? `<h2>${past ? 'Offen geblieben' : 'Dran'}<span class="count">${open.length}</span></h2>${openRows}` : ''}
    </div>`;
}

function viewSettings() {
  const hh = S.hh;
  const load = loadByPerson(S.tasks, hh);

  const persons = hh.persons.map((p, i) => `<div class="setting">
      <label class="field">Person ${i + 1}<input type="text" data-person-name="${i}" value="${esc(p.name)}" maxlength="30"></label>
      <div class="colors">${COLORS.map(([c, l]) => `<button data-person-color="${i}" data-color="${c}" aria-pressed="${p.color === c}"><i class="sw" style="--pc:var(--c-${c})"></i>${l}</button>`).join('')}</div>
    </div>`).join('');

  const tasks = S.tasks.length
    ? S.tasks.slice().sort((x, y) => kindRank(x) - kindRank(y) || (x.order ?? 0) - (y.order ?? 0)).map((t) => `
      <button class="rowbtn" data-edit="${esc(t.id)}"><span>${esc(t.title)}<br><span class="meta">${intervalLabel(t)} · ${assignLabel(t.assign)}${t.min ? ` · ${t.min} Min` : ''}${t.season ? ` · Saison ${seasonLabel(t.season)}` : ''}</span></span><span class="meta">Bearbeiten</span></button>`).join('')
    : '<p class="muted">Noch keine Aufgaben.</p>';

  const away = hh.persons.map((p) => {
    const a = hh.away?.[p.id] || {};
    return `<div class="setting"><p>${pn(p.id)}</p>
      <div class="inline"><label class="field">von<input type="date" data-away-from="${p.id}" value="${esc(a.from || '')}"></label>
        <label class="field">bis<input type="date" data-away-to="${p.id}" value="${esc(a.to || '')}"></label></div>
      ${a.from || a.to ? `<button class="btn" data-away-clear="${p.id}">Abwesenheit löschen</button>` : ''}</div>`;
  }).join('');

  const wir = `
    <h2>Personen</h2>
    ${persons}
    <h2>Putztage</h2>
    <p class="small">An diesen Tagen sind die Aufgaben der jeweiligen Person dran. Gemeinsames am gemeinsamen Putztag.</p>
    ${hh.persons.map((p, i) => `<div class="setting"><p>${pn(p.id)}${p.id === S.me ? ' (du)' : ''}</p>${dayChips(p.days?.length ? p.days : [5], `data-person-day="${i}"`)}</div>`).join('')}
    <div class="setting"><p>Gemeinsam</p>${dayChips(hh.sharedDays?.length ? hh.sharedDays : [5], 'data-shared-day')}</div>
    <h2>Abwesend (Urlaub, krank)</h2>
    <p class="small">In dieser Zeit pausieren die eigenen Aufgaben: nichts wird „vergessen“. Gemeinsames pausiert nur, wenn beide weg sind.</p>
    ${away}`;

  const aufgaben = `
    <p class="small">Aufwand pro Monat (Dauer × Häufigkeit, Gemeinsames je zur Hälfte): ${hh.persons.map((p) => `${byName(p.id)} ${hours(load[p.id])} h`).join(' · ')}</p>
    <div class="btnrow"><button class="btn block" data-edit="">Aufgabe hinzufügen</button></div>
    <div class="rows">${tasks}</div>
    <h2>Unsere Abmachungen</h2>
    <p class="small">Selbstverständliches für jeden Tag. Steht bei „Aktuell“ ganz oben: jeden Tag neu abhakbar, wer zuerst erledigt, hakt für beide ab. Wird nie als offen angezeigt, zählt aber in Bilanz und Verlauf. Vorschläge antippen zum Auswählen, eigene unten eintragen (eine pro Zeile).</p>
    ${ruleChips(hh.rules || [], 'data-rule-suggest')}
    <label class="field">Eigene Abmachungen<textarea data-rules rows="4" placeholder="Pflanzen am Fensterbrett gießen&#10;Post reinholen">${esc(ownRules().join('\n'))}</textarea></label>
    <h2>Plan neu einrichten</h2>
    <p class="small">Aufgaben neu aus der Vorlage (fair aufgeteilt) oder leer aufbauen. Code, Verbindung zur anderen Person und Verlauf bleiben, gezählt wird ab heute.</p>
    <div class="btnrow"><button class="btn block" data-action="reset-plan">Plan neu einrichten</button></div>`;

  const geraet = `
    <h2>Ich bin</h2>
    <div class="btnrow">${hh.persons.map((p) => `<button class="btn" data-me="${p.id}" aria-pressed="${S.me === p.id}">${esc(p.name)}</button>`).join('')}</div>
    <h2>Zahl am App-Icon</h2>
    <p class="small">Zeigt, was bei dir vergessen oder jetzt dran ist (ohne Tägliches).</p>
    ${badgeSetting()}
    ${canHaptic ? `<h2>Vibrieren</h2>
    ${switchRow('vibrate', ls.get('vibrate') !== '0', 'Beim Abhaken kurz vibrieren', 'Gilt nur für dieses Gerät.')}` : ''}
    <h2>Darstellung</h2>
    <div class="btnrow">
      <button class="btn" data-theme-set="dark" aria-pressed="${theme() === 'dark'}">Dunkel</button>
      <button class="btn" data-theme-set="light" aria-pressed="${theme() === 'light'}">Hell</button>
    </div>`;

  const haushalt = `
    <h2>Einladen</h2>
    <p class="small">QR-Code mit der Handy-Kamera scannen oder Link schicken. Nicht öffentlich teilen.</p>
    ${fold('invite', 'QR-Code und Link', inviteBlock())}
    <div class="btnrow"><button class="btn" data-action="copy">Code kopieren</button></div>
    ${S.store.mode === 'local' ? '<p class="small"><span class="ov">Lokaler Testmodus:</span> config.js ist nicht befüllt, Daten liegen nur auf diesem Gerät.</p>' : ''}
    <h2>Backup</h2>
    <p class="small">Sichert Haushalt, Aufgaben und Verlauf in eine Datei (z. B. in „Dateien“). Einspielen ersetzt die Aufgaben durch die aus der Datei.</p>
    <div class="btnrow"><button class="btn" data-action="export">Daten exportieren</button><button class="btn" data-action="import">Daten importieren</button></div>
    <input type="file" id="importFile" accept=".json,application/json" hidden>
    <h2>Start des Plans</h2>
    <label class="field">Ab diesem Tag zählen die Termine<input type="date" data-start value="${esc(hh.setup)}"></label>
    <p class="small">Davor ist nichts „vergessen“. Wird beim Einrichten automatisch gesetzt. Ändern, wenn ihr erst später loslegen wollt (z. B. nach einem Urlaub oder Umzug) oder neu zu zählen beginnen wollt, ohne den Plan neu einzurichten. Auch der 2-Wochen-Rhythmus zählt ab hier.</p>
    <h2>Abmelden</h2>
    <p class="small">Entfernt den Haushalt nur von diesem Gerät. Mit dem Code kannst du wieder beitreten.</p>
    <div class="btnrow"><button class="btn danger" data-action="leave">Auf diesem Gerät abmelden</button></div>`;

  return `
    ${optGroup('opt-wir', 'Wir', 'Personen, Putztage, Abwesenheit', wir)}
    ${optGroup('opt-tasks', 'Aufgaben', 'Liste, Abmachungen, Plan neu einrichten', aufgaben)}
    ${optGroup('opt-device', 'Dieses Gerät', 'Ich bin, Zahl am Icon, Vibrieren, Darstellung', geraet)}
    ${optGroup('opt-hh', 'Haushalt', 'Einladen, Backup, Start, Abmelden', haushalt)}`;
}

// Gruppe in den Optionen: große, aufklappbare Fläche mit kurzer Inhaltsangabe
const optGroup = (key, title, hint, body) => `<details class="fold opt" data-fold="${key}" ${S.open[key] ? 'open' : ''}>
  <summary><span><strong>${title}</strong><span class="small">${hint}</span></span></summary><div class="opt-body">${body}</div></details>`;

function renderWhoAmI() {
  app.innerHTML = `<header class="top">${LOGO}</header>
    <h2>Wer bist du?</h2>
    <p>Einmalig pro Gerät. Deine Aufgaben stehen danach zuerst.</p>
    <div class="btnrow">${S.hh.persons.map((p) => `<button class="btn block" data-me="${p.id}">${pn(p.id)}</button>`).join('')}</div>`;
}

// ---------- Einrichtung ----------

// reset: „Plan neu einrichten“ im bestehenden Haushalt (Code, Verbindung und Verlauf bleiben)
function startSetup(reset = false) {
  S.setup = reset
    ? { step: 'persons', reset: true, persons: S.hh.persons.map((p) => ({ name: p.name, color: p.color, days: p.days?.length ? p.days : [5] })),
      shared: S.hh.sharedDays?.length ? S.hh.sharedDays : [5], start: S.today,
      rules: (S.hh.rules || []).filter((r) => TEMPLATE_RULES.includes(r)), tasks: [], error: '' }
    : { step: 'start', persons: [{ name: '', color: 'violett', days: [5] }, { name: '', color: 'gruen', days: [5] }],
      shared: [5], start: S.today, rules: [], tasks: [], error: '' };
  renderSetup();
}

const hours = (min) => (min / 60).toLocaleString('de-AT', { maximumFractionDigits: 1 });
const setupCtx = () => ({ ...DEFAULT_HOUSEHOLD, setup: S.setup.start, persons: [{ id: 'p1' }, { id: 'p2' }] });


// Wochentage zum An-/Abwählen (Putztage)
const dayChips = (picked, attr) => `<div class="filters days">${WEEKDAYS.map((w, i) =>
  `<button ${attr} data-wd="${i}" aria-pressed="${picked.includes(i)}">${w}</button>`).join('')}</div>`;
const toggledDay = (list, d) => { const n = toggled(list, d); return n.length ? n.sort((a, b) => a - b) : list; };

function renderSetup() {
  const st = S.setup;
  const err = st.error ? `<p class="ov">${esc(st.error)}</p>` : '';
  const local = S.store?.mode === 'local' ? '<p class="small"><span class="ov">Lokaler Testmodus:</span> config.js ist nicht befüllt.</p>' : '';
  const finish = st.reset ? 'Plan übernehmen' : 'Haushalt anlegen';
  let body = '';
  if (st.step === 'start') {
    body = `<h2>Willkommen</h2>
      <p>Ein Putzplan für deinen Haushalt. Lege einen Haushalt an oder tritt mit einem Code bei.</p>
      <div class="btnrow"><button class="btn primary block" data-setup="new">Haushalt neu anlegen</button></div>
      <h2>Beitreten</h2>
      <label class="field">Haushalts-Code<input type="text" id="joinCode" class="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX"></label>
      <div class="btnrow"><button class="btn block" data-setup="join">Beitreten</button></div>${err}${local}`;
  } else if (st.step === 'persons') {
    body = `<h2>${st.reset ? 'Plan neu einrichten · ' : ''}Schritt 1 von 3 · Personen</h2>
      ${st.persons.map((p, i) => `<div class="setting">
        <label class="field">Name Person ${i + 1}<input type="text" data-setup-name="${i}" value="${esc(p.name)}" maxlength="30"></label>
        <div class="colors">${COLORS.map(([c, l]) => `<button data-setup-color="${i}" data-color="${c}" aria-pressed="${p.color === c}"><i class="sw" style="--pc:var(--c-${c})"></i>${l}</button>`).join('')}</div>
        <p class="small">Wann ist der Putztag? (mehrere möglich)</p>${dayChips(p.days, `data-setup-day="${i}"`)}
      </div>`).join('')}
      <div class="setting"><p class="small">Gemeinsamer Putztag (für Gemeinsames)</p>${dayChips(st.shared, 'data-setup-shared')}</div>
      <p class="small">An ihren Putztagen sind die Aufgaben der jeweiligen Person dran. Später in den Optionen änderbar.</p>
      ${err}
      <div class="btnrow"><button class="btn" data-setup="${st.reset ? 'cancel' : 'start'}">${st.reset ? 'Abbrechen' : 'Zurück'}</button><button class="btn primary" data-setup="template">Weiter</button></div>`;
  } else if (st.step === 'template') {
    body = `<h2>Schritt 2 von 3 · Vorlage</h2>
      <button class="choice" data-setup="split"><strong>Vorschlag 2-Personen-Haushalt</strong>
        <span>${TEMPLATE.length} Aufgaben mit geschätzter Dauer, fair aufgeteilt und auf eure Putztage verteilt, dazu ${TEMPLATE_RULES.length} Abmachungen</span></button>
      <button class="choice" data-setup="rules"><strong>Leer starten</strong>
        <span>Aufgaben selbst anlegen, Abmachungen auswählen</span></button>${err}
      ${st.reset ? '<p class="small">Die bisherigen Aufgaben werden ersetzt. Code, Verbindung und Verlauf bleiben.</p>' : ''}
      <div class="btnrow"><button class="btn" data-setup="persons">Zurück</button></div>`;
  } else if (st.step === 'split') {
    const load = loadByPerson(st.tasks, setupCtx());
    const names = st.persons.map((p) => esc(p.name.trim()));
    const list = (pkg) => st.tasks.map((t, i) => [t, i]).filter(([t]) => t.assign === pkg).map(([t, i]) => `
      <button class="rowbtn" data-split="${i}"><span>${esc(t.title)}<br><span class="meta">${t.min} Min · ${intervalLabel(t)} · ${hours(monthlyMinutes(t))} h/Monat</span></span><span class="meta">tauschen</span></button>`).join('');
    body = `<h2>Schritt 3 von 3 · Aufteilung</h2>
      <div class="banner now">${names[0]} <strong>${hours(load.p1)} h</strong> · ${names[1]} <strong>${hours(load.p2)} h</strong> pro Monat</div>
      <p class="small">Automatisch fair verteilt: pro Intervall gleich viele Aufgaben und möglichst gleich viel Zeit (Dauer × Häufigkeit). Antippen gibt eine Aufgabe der anderen Person – die Bilanz rechnet mit. Gemeinsames zählt je zur Hälfte. Zeiten kannst du später bei jeder Aufgabe ändern.</p>
      <h2><i class="sw" style="--pc:var(--c-${st.persons[0].color})"></i>${names[0]}</h2><div class="rows">${list('A')}</div>
      <h2><i class="sw" style="--pc:var(--c-${st.persons[1].color})"></i>${names[1]}</h2><div class="rows">${list('B')}</div>
      <p class="small">Dazu ${st.tasks.filter((t) => t.assign !== 'A' && t.assign !== 'B').length} gemeinsame, abwechselnde oder persönliche Aufgaben und alle ${TEMPLATE_RULES.length} Abmachungen.</p>
      ${err}
      <div class="btnrow"><button class="btn" data-setup="template">Zurück</button><button class="btn primary" data-setup="create-template">${finish}</button></div>`;
  } else if (st.step === 'rules') {
    body = `<h2>Schritt 3 von 3 · Abmachungen</h2>
      <p class="small">Selbstverständliches für jeden Tag – für beide abhakbar, nie „offen“. Später in den Optionen änderbar.</p>
      ${ruleChips(st.rules, 'data-setup-rule')}${err}
      <div class="btnrow"><button class="btn" data-setup="template">Zurück</button><button class="btn primary" data-setup="create-empty">${finish}</button></div>`;
  } else if (st.step === 'busy') {
    body = '<p class="loading">Einen Moment …</p>';
  } else if (st.step === 'created') {
    body = `<h2>Haushalt angelegt</h2>
      <p>Jetzt ${esc(st.persons[1].name.trim())} einladen: QR-Code mit der Handy-Kamera scannen oder den Link schicken.</p>
      ${inviteBlock()}
      <div class="btnrow"><button class="btn primary block" data-setup="done">Weiter</button></div>`;
  } else if (st.step === 'joined') {
    body = `<h2>Beigetreten</h2>
      <p>Jetzt Fairplan auf den Home-Bildschirm legen: unten auf <strong>Teilen</strong> tippen → <strong>Zum Home-Bildschirm</strong>.</p>
      <p class="small">Fragt die App dort nochmal nach dem Code: hier kopieren und einfügen.</p>
      <p class="code">${formatCode(S.code)}</p>
      <div class="btnrow"><button class="btn" data-action="copy">Code kopieren</button><button class="btn primary" data-setup="done">Weiter</button></div>`;
  }
  app.innerHTML = `<header class="top">${LOGO}</header>${body}`;
  fillQr();
}

// Termine erst beim Anlegen verteilen (nach dem Umverteilen auf A/B)
function setupTasks(withTemplate) {
  return withTemplate ? spreadPositions(S.setup.tasks).map((t, i) => ({ ...t, id: newId(), created: S.setup.start, order: i })) : [];
}
const setupPersons = () => S.setup.persons.map((p, i) => ({ id: `p${i + 1}`, name: p.name.trim(), color: p.color, days: p.days }));
const setupRules = (withTemplate) => (withTemplate ? TEMPLATE_RULES : TEMPLATE_RULES.filter((r) => S.setup.rules.includes(r)));

async function createHousehold(withTemplate) {
  const st = S.setup;
  const code = newCode();
  const doc = {
    ...DEFAULT_HOUSEHOLD,
    setup: st.start,
    sharedDays: st.shared,
    persons: setupPersons(),
    rules: setupRules(withTemplate),
    createdAt: new Date().toISOString(),
  };
  const tasks = setupTasks(withTemplate);
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

// Plan neu einrichten: Aufgaben ersetzen, neuer Start; Code, Personen-IDs, eigene Abmachungen und Verlauf bleiben
function resetPlan(withTemplate) {
  const st = S.setup;
  const persons = S.hh.persons.map((p, i) => ({ ...p, ...setupPersons()[i], id: p.id }));
  for (const t of S.tasks) S.store.deleteTask(S.code, t.id);
  for (const t of setupTasks(withTemplate)) S.store.saveTask(S.code, t);
  updateHH({ persons, sharedDays: st.shared, rules: [...setupRules(withTemplate), ...ownRules()], setup: st.start, swapped: false });
  S.setup = null;
  S.view = 'heute';
  window.scrollTo(0, 0);
  render();
  snack('Plan neu eingerichtet.');
}

// ---------- Einladung ----------

const inviteLink = () => `${location.origin}${location.pathname}?join=${S.code}`;
const inviteBlock = () => `<div class="qr" id="qr" aria-label="QR-Code zum Beitreten"></div>
  <div class="btnrow">${navigator.share ? '<button class="btn" data-action="share">Link teilen</button>' : ''}<button class="btn" data-action="copy-link">Link kopieren</button></div>
  <p class="small">Oder in Fairplan unter „Beitreten“ den Code eingeben: <span class="code">${formatCode(S.code)}</span></p>`;

// QR-Bibliothek erst bei Bedarf laden
let qrLib;
function fillQr() {
  const el = $('#qr');
  if (!el || el.firstChild) return;
  qrLib ||= new Promise((resolve, reject) => {
    const sc = document.createElement('script');
    sc.src = 'js/qrcode.js';
    sc.onload = () => resolve(window.qrcode);
    sc.onerror = () => { qrLib = null; reject(); };
    document.head.append(sc);
  });
  qrLib.then((qrcode) => {
    const q = qrcode(0, 'M');
    q.addData(inviteLink());
    q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }).catch(() => { el.textContent = 'QR-Code gerade nicht verfügbar (offline?).'; });
}

async function joinHousehold(fromLink) {
  const st = S.setup;
  const code = normalizeCode(fromLink || $('#joinCode').value);
  if (code.length !== 16) { st.error = 'Der Code hat 16 Zeichen.'; return renderSetup(); }
  st.step = 'busy'; renderSetup();
  let hh = null;
  try { hh = await S.store.getHousehold(code); } catch (e) { console.error(e); }
  if (!hh) { Object.assign(st, { step: 'start', error: 'Kein Haushalt mit diesem Code gefunden (oder offline).' }); return renderSetup(); }
  ls.set('code', code);
  S.code = code;
  // im Browser (nicht vom Home-Bildschirm) beigetreten: Hinweis, die App noch abzulegen
  if (fromLink && !standalone()) { st.step = 'joined'; return renderSetup(); }
  S.setup = null;
  connect(code);
}
const standalone = () => navigator.standalone || matchMedia('(display-mode: standalone)').matches;

// ---------- Aktionen ----------

function theme() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; }
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  $('meta[name="theme-color"]').content = t === 'light' ? '#ffffff' : '#111214';
  ls.set('theme', t);
}

// Kurzes Vibrieren: Android über navigator.vibrate, iPhone (Safari 17.4+) über einen versteckten Schalter
const canHaptic = 'vibrate' in navigator || 'switch' in HTMLInputElement.prototype;
function haptic() {
  if (ls.get('vibrate') === '0') return;
  if (navigator.vibrate) { navigator.vibrate(10); return; }
  if (!canHaptic) return;
  let l = $('#haptic');
  if (!l) {
    l = document.createElement('label');
    l.id = 'haptic';
    l.innerHTML = '<input type="checkbox" switch>';
    document.body.append(l);
  }
  l.click();
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
    const row = input.closest('.item');
    row.classList.add('checking');
    const slide = S.view === 'heute';
    if (slide) setTimeout(() => row.classList.add('leaving'), 350);
    setTimeout(() => S.store.setCompletion(S.code, id, data), slide ? 600 : 350);
    haptic();
    const proxy = it.owner && it.owner !== S.me ? ` für ${esc(person(it.owner).name)}` : '';
    snack(`Erledigt${proxy}.`, () => S.store.removeCompletion(S.code, id));
  } else {
    const prev = S.comps.get(id);
    S.store.removeCompletion(S.code, id);
    snack('Wieder offen.', prev ? () => S.store.setCompletion(S.code, id, prev) : null);
  }
}

function toggleRule(input) {
  const title = input.dataset.rule;
  const id = completionId(ruleId(title), ruleKey(), null);
  if (input.checked) {
    S.store.setCompletion(S.code, id, {
      taskId: ruleId(title), title, key: ruleKey(), slot: null, forPerson: null,
      by: S.me, at: new Date().toISOString(), day: S.today, rule: true,
    });
    haptic();
    snack('Erledigt.', () => S.store.removeCompletion(S.code, id));
  } else {
    const prev = S.comps.get(id);
    S.store.removeCompletion(S.code, id);
    snack('Wieder offen.', prev ? () => S.store.setCompletion(S.code, id, prev) : null);
  }
}

// ---------- Backup ----------

async function exportData() {
  try {
    const data = { app: 'fairplan', version: 1, exportedAt: new Date().toISOString(), ...(await S.store.exportAll(S.code)) };
    const name = `fairplan-backup-${S.today}.json`;
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  } catch (e) {
    if (e?.name !== 'AbortError') { console.error(e); snack('Export fehlgeschlagen (offline?).'); }
  }
}

async function importFile(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  if (data?.app !== 'fairplan' || !data.household || !Array.isArray(data.tasks) || !Array.isArray(data.completions)) {
    return snack('Das ist keine Fairplan-Sicherung.');
  }
  const when = data.exportedAt ? fmtLong(data.exportedAt.slice(0, 10)) : '?';
  if (!confirm(`Sicherung vom ${when} einspielen? Die Aufgaben werden durch die aus der Datei ersetzt.`)) return;
  try {
    await S.store.importAll(S.code, data);
    snack('Sicherung eingespielt.');
  } catch (e) {
    console.error(e);
    snack('Einspielen fehlgeschlagen (offline?).');
  }
}

// ---------- Teilschritte ----------

// Erledigung eines Teilschritts: eigene Kennung, gleicher Perioden-Schlüssel wie die Aufgabe (wird mitgeladen)
const stepId = (it, i) => `${completionId(it.task.id, it.key, it.slot)}__s${i}`;
const stepsDone = (it) => (it.task.steps || []).filter((_, i) => S.comps.has(stepId(it, i))).length;

function stepsBlock(it) {
  const steps = it.task.steps || [];
  if (!steps.length || it.status === 'done' || !it.key) return '';
  const key = `st-${it.task.id}-${it.slot ?? ''}`;
  return `<details class="steps" data-fold="${key}" ${S.open[key] ? 'open' : ''}><summary>Teilschritte ${stepsDone(it)}/${steps.length}</summary>
    ${steps.map((st, i) => `<label class="step"><input type="checkbox" data-action="toggle-step" data-task="${esc(it.task.id)}" data-slot="${esc(it.slot ?? '')}"
      data-step="${i}" ${S.comps.has(stepId(it, i)) ? 'checked' : ''}><span class="box"></span><span>${esc(st)}</span></label>`).join('')}</details>`;
}

function toggleStep(input) {
  const task = S.tasks.find((t) => t.id === input.dataset.task);
  const slot = input.dataset.slot || null;
  const it = task && evaluate(task, S.hh, S.today, S.comps).find((i) => (i.slot ?? null) === slot);
  if (!it?.key) return;
  const i = +input.dataset.step;
  const id = stepId(it, i);
  if (!input.checked) { S.store.removeCompletion(S.code, id); return; }
  haptic();
  S.store.setCompletion(S.code, id, {
    taskId: task.id, title: `${task.title}: ${task.steps[i]}`, key: it.key, slot, step: i, forPerson: it.owner,
    by: S.me, at: new Date().toISOString(), day: S.today,
  });
  // alle Teilschritte erledigt → Aufgabe erledigt
  const all = task.steps.every((_, j) => j === i || S.comps.has(stepId(it, j)));
  if (all) {
    const main = completionId(task.id, it.key, slot);
    S.store.setCompletion(S.code, main, {
      taskId: task.id, title: task.title, key: it.key, slot, forPerson: it.owner,
      by: S.me, at: new Date().toISOString(), day: S.today,
    });
    snack('Alle Teilschritte erledigt – Aufgabe erledigt.', () => S.store.removeCompletion(S.code, main));
  }
}

async function copyCode() {
  const text = formatCode(S.code);
  try { await navigator.clipboard.writeText(text); snack('Code kopiert.'); } catch { snack(`Code: ${text}`); }
}

function updateHH(patch) { S.store.updateHousehold(S.code, patch); }

app.addEventListener('click', (e) => {
  const el = e.target.closest('button, [data-action], [data-cal-close]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.view) {
    if (d.view === 'kalender') { S.calMonth = null; S.calDay = null; }
    S.view = d.view; window.scrollTo(0, 0); return render();
  }
  if (d.filter) { S.filter = d.filter; return render(); }
  if (d.kindFilter) { S.kindFilter = d.kindFilter; return render(); }
  if (d.awayClear) return updateHH({ away: { ...(S.hh.away || {}), [d.awayClear]: {} } });
  if (d.calDay) { S.calDay = d.calDay; S.panelAnim = true; render(); S.panelAnim = false; return; }
  if (el.matches('[data-cal-close]')) { S.calDay = null; return render(); }
  if (d.calMonth) {
    const [y, m] = (S.calMonth || S.today.slice(0, 7)).split('-').map(Number);
    const t = new Date(y, m - 1 + +d.calMonth, 1);
    S.calMonth = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    S.calDay = null;
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
  if (d.setupRule) { S.setup.rules = toggled(S.setup.rules, d.setupRule); return renderSetup(); }
  if (d.setupDay) { const p = S.setup.persons[+d.setupDay]; p.days = toggledDay(p.days, +d.wd); return renderSetup(); }
  if (el.matches('[data-setup-shared]')) { S.setup.shared = toggledDay(S.setup.shared, +d.wd); return renderSetup(); }
  if (d.personDay) {
    const persons = S.hh.persons.map((p, i) => (i === +d.personDay ? { ...p, days: toggledDay(p.days?.length ? p.days : [5], +d.wd) } : p));
    return updateHH({ persons });
  }
  if (el.matches('[data-shared-day]')) return updateHH({ sharedDays: toggledDay(S.hh.sharedDays?.length ? S.hh.sharedDays : [5], +d.wd) });
  if (d.split) {
    const t = S.setup.tasks[+d.split];
    t.assign = t.assign === 'A' ? 'B' : 'A';
    return renderSetup();
  }
  if (d.ruleSuggest) {
    // vorgeschlagene Abmachungen in Vorschlagsreihenfolge vorne, eigene dahinter
    const picked = toggled((S.hh.rules || []).filter((r) => TEMPLATE_RULES.includes(r)), d.ruleSuggest);
    return updateHH({ rules: [...TEMPLATE_RULES.filter((r) => picked.includes(r)), ...ownRules()] });
  }
  if (d.setup) return setupAction(d.setup);
  switch (d.action) {
    case 'copy': return copyCode();
    case 'copy-link':
      navigator.clipboard?.writeText(inviteLink()).then(() => snack('Link kopiert.'), () => snack(inviteLink()));
      return;
    case 'share':
      navigator.share({ title: 'Fairplan', text: 'Tritt unserem Putzplan bei:', url: inviteLink() }).catch(() => {});
      return;
    case 'reset-plan': window.scrollTo(0, 0); return startSetup(true);
    case 'export': return exportData();
    case 'import': $('#importFile').click(); return;
    case 'badge':
      Notification.requestPermission().then(() => { lastBadge = -1; render(); }).catch(() => {});
      return;
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
  else if (a === 'rules') st.step = 'rules';
  else if (a === 'split') {
    if (!st.tasks.length) st.tasks = autoSplit(TEMPLATE);
    st.step = 'split';
  } else if (a === 'template') {
    if (st.persons.some((p) => !p.name.trim())) st.error = 'Bitte beide Namen eingeben.';
    else st.step = 'template';
  } else if (a === 'create-template' || a === 'create-empty') {
    const tpl = a === 'create-template';
    return st.reset ? resetPlan(tpl) : createHousehold(tpl);
  } else if (a === 'join') return joinHousehold();
  else if (a === 'cancel') { S.setup = null; return render(); }
  else if (a === 'done') { S.setup = null; connect(S.code); return; }
  window.scrollTo(0, 0);
  renderSetup();
}

app.addEventListener('change', (e) => {
  const el = e.target;
  const d = el.dataset;
  if (d.action === 'toggle') return toggle(el);
  if (d.action === 'toggle-rule') return toggleRule(el);
  if (d.action === 'plan') { ls.set('plan', el.checked ? '1' : null); return render(); }
  if (d.action === 'toggle-step') return toggleStep(el);
  if (d.switch === 'vibrate') { ls.set('vibrate', el.checked ? null : '0'); if (el.checked) haptic(); return; }
  if (el.id === 'importFile') return importFile(el);
  if (d.personName !== undefined) {
    const name = el.value.trim();
    if (!name) return render();
    const persons = S.hh.persons.map((p, i) => (i === +d.personName ? { ...p, name } : p));
    return updateHH({ persons });
  }
  if (d.start !== undefined) {
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(el.value) && el.value !== S.hh.setup
      && confirm('Start ändern? Der 2-Wochen-Rhythmus verschiebt sich mit. Schon Abgehaktes im laufenden 2-Wochen-Block kann dadurch wieder offen erscheinen.');
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
    const own = el.value.split('\n').map((r) => r.trim()).filter((r) => r && !TEMPLATE_RULES.includes(r));
    updateHH({ rules: [...(S.hh.rules || []).filter((r) => TEMPLATE_RULES.includes(r)), ...own].slice(0, 50) });
    return snack('Abmachungen gespeichert.');
  }
});

// Wischen nach rechts = abhaken (Zeilen mit data-swipe; senkrechtes Scrollen bleibt frei)
let swipe = null, swallowClick = false;
app.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.item[data-swipe]');
  swipe = row && e.isPrimary ? { row, x: e.clientX, y: e.clientY, dx: 0, active: false } : null;
});
app.addEventListener('pointermove', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (!swipe.active) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
    if (dx < 12) return;
    swipe.active = true;
    swipe.row.classList.add('dragging');
  }
  swipe.dx = Math.max(0, dx);
  swipe.row.style.transform = `translateX(${swipe.dx}px)`;
});
function endSwipe() {
  if (!swipe) return;
  const { row, dx, active } = swipe;
  swipe = null;
  if (!active) return;
  swallowClick = true;
  setTimeout(() => { swallowClick = false; }, 300);
  row.classList.remove('dragging');
  row.style.transform = '';
  const input = row.querySelector('input[data-action="toggle"]');
  if (dx > Math.min(100, row.offsetWidth * 0.3) && input && !input.checked) { input.checked = true; toggle(input); }
}
app.addEventListener('pointerup', endSwipe);
app.addEventListener('pointercancel', endSwipe);
// nach einem Wischer keinen Klick auf die Checkbox auslösen
app.addEventListener('click', (e) => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; } }, true);

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
    <label class="field">Intervall<select name="kind">${KINDS.filter((k) => k !== 'custom' || kind === 'custom').map((k) => opt(k, k === 'custom' ? `Eigenes: alle ${t.n} ${UNIT_LABEL[t.unit]?.[1] ?? ''}` : KIND_LABEL[k], kind)).join('')}</select></label>
    <div class="inline" data-custom><span>alle</span><input type="number" name="n" min="1" max="999" value="${t.n}" inputmode="numeric">
      <select name="unit">${Object.entries(UNIT_LABEL).map(([u, l]) => opt(u, l[1], t.unit)).join('')}</select></div>
    <label class="field" data-permonth>Ca. wie oft pro Monat?<input type="number" name="perMonth" min="0" max="99" step="0.5" inputmode="decimal" value="${t.perMonth ?? ''}"></label>
    <label class="field">Zuteilung<select name="assign">${Object.keys(ASSIGN_LABEL).filter((v) => v !== 'alternate' || t.assign === 'alternate').map((v) => opt(v, v === 'shared' ? 'Gemeinsam (jede/r darf abhaken)' : v === 'alternate' ? 'Abwechselnd (jedes Mal die andere Person)' : v === 'each' ? 'Pro Person (jede/r für sich)' : S.hh.persons[v === 'A' ? 0 : 1].name, t.assign)).join('')}</select></label>
    <label class="field">Dauer in Minuten (geschätzt, für die faire Aufteilung)<input type="number" name="min" min="0" max="999" inputmode="numeric" value="${t.min ?? ''}"></label>
    <p class="small" data-next></p>
    <details class="more" ${t.note || t.season || t.steps?.length || Number.isInteger(t.day) ? 'open' : ''}>
      <summary>Mehr: Tag, Termin, Saison, Hinweis, Teilschritte</summary>
      <label class="field" data-day>Tag<select name="day">${opt('', 'An den Putztagen der zuständigen Person', t.day ?? '')}${WEEKDAYS_LONG.map((w, i) => opt(i, `Fest am ${w}`, t.day ?? '')).join('')}</select></label>
      <label class="field" data-pos>Termin<select name="pos"></select></label>
      <label class="cb"><input type="checkbox" name="hasSeason" ${t.season ? 'checked' : ''}> Nur in einer Saison</label>
      <div class="inline" data-season><select name="from">${months(t.season?.from ?? 3)}</select><span>bis</span><select name="to">${months(t.season?.to ?? 10)}</select></div>
      <label class="field">Hinweis<input type="text" name="note" value="${esc(t.note)}" maxlength="200"></label>
      <label class="field">Teilschritte (einer pro Zeile)<textarea name="steps" rows="3" placeholder="WC&#10;Waschbecken&#10;Dusche">${esc((t.steps || []).join('\n'))}</textarea></label>
    </details>
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
    return {
      id: 'x', ...iv, assign: f.assign.value, season: f.hasSeason.checked ? { from: +f.from.value, to: +f.to.value } : null,
      day: f.day.value === '' ? null : +f.day.value, pos: +f.pos.value || 0,
      created: t.created || S.today, ...over,
    };
  };
  const upcoming = (task, n) => windowsBetween(task, S.hh, S.today, fromDay(toDay(S.today) + 400))
    .filter((w, i, a) => w.end >= S.today && a.findIndex((x) => x.key === w.key) === i).slice(0, n);
  // Termin-Auswahl: wöchentlich der wievielte Putztag, sonst die Woche im Zeitraum – mit dem nächsten Datum dazu
  const posOptions = () => {
    const d = draft({ pos: 0 });
    const k = kindOf(d);
    const span = k === 'weekly' ? 3 : weeksPerPeriod(d);
    const where = { biweekly: '', monthly: ' im Monat', quarterly: ' im Quartal', halfyear: ' im Halbjahr', yearly: ' im Jahr' }[k] ?? '';
    const cur = Math.min(f.pos.options.length ? +f.pos.value : +(t.pos ?? 0) || 0, span - 1);
    f.pos.innerHTML = Array.from({ length: span }, (_, i) => {
      const w = upcoming(draft({ pos: i }), 1)[0];
      const label = k === 'weekly' ? `${i + 1}. Putztag der Woche` : `${i + 1}. Woche${where}`;
      return opt(i, `${label}${w ? ` – ${fmtWd(w.start)}` : ''}`, cur);
    }).join('');
  };
  const sync = () => {
    const k = f.kind.value;
    const rhythm = !['daily', 'asneeded'].includes(k) && !(k === 'custom' && f.unit.value === 'day');
    $('[data-day]', form).hidden = !rhythm;
    $('[data-pos]', form).hidden = !rhythm;
    if (rhythm) posOptions();
    const next = upcoming(draft(), 3).map((w) => (w.start === w.end ? fmtWd(w.start) : `${fmtWd(w.start)}–${fmtWd(w.end)}`));
    $('[data-next]', form).textContent = next.length && k !== 'daily' ? `Nächste Termine: ${next.join(' · ')}` : '';
    $('[data-custom]', form).hidden = k !== 'custom';
    $('[data-permonth]', form).hidden = k !== 'asneeded';
    $('[data-season]', form).hidden = !f.hasSeason.checked;
    $('[data-hint]', form).textContent = k === 'asneeded'
      ? 'Bei Bedarf: kein fixer Rhythmus, nie „nicht geschafft“. Einfach abhaken, wenn erledigt – zählt trotzdem im Verlauf und Kalender.'
      : k === 'halfyear' ? 'Halbjährlich = Jänner–Juni und Juli–Dezember.' : '';
  };
  sync();
  f.kind.addEventListener('change', () => {
    if (isNew && (f.kind.value === 'halfyear' || f.kind.value === 'yearly')) f.assign.value = 'shared';
    sync();
  });
  f.hasSeason.addEventListener('change', sync);
  for (const el of [f.day, f.pos, f.n, f.unit, f.from, f.to, f.assign]) el.addEventListener('change', sync);
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
      day: $('[data-day]', form).hidden || f.day.value === '' ? null : +f.day.value,
      pos: $('[data-pos]', form).hidden ? null : +f.pos.value || 0,
      created: t.created || S.today,
      order: t.order ?? Math.max(-1, ...S.tasks.map((x) => x.order ?? 0)) + 1,
      min: f.min.value === '' ? null : Math.max(0, Math.min(999, parseInt(f.min.value, 10) || 0)),
      perMonth: k === 'asneeded' && f.perMonth.value !== '' ? Math.max(0, Math.min(99, parseFloat(f.perMonth.value) || 0)) : null,
      steps: f.steps.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 20),
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
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!sheet.hidden) closeEditor();
  else if (S.calDay) { S.calDay = null; render(); }
});
