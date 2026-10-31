import {
  KINDS, PRESETS, kindOf, evaluate, inSeason, relevantKeys, completionId,
  localToday, toDay, fromDay, windowsBetween, awayDuring,
  monthlyMinutes, loadByPerson, autoSplit, spreadPositions, weeksPerPeriod, holidays, isoWeek, dueBetween, streaks,
  packageOwners, rotationBase, swapCount, nextSwap, ownerNow,
} from './logic.js';
import { openStore, newCode, newId, normalizeCode, formatCode } from './store.js';
import { AREAS, QUESTIONS, suggestTasks, suggestRules, defaultAssign, OUR_TASKS, OUR_RULES, RULE_SEASONS, RULE_COMMON, RULE_GROUPS, RULE_SUGGESTIONS, RULE_RENAMED } from './template.js';

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

const APP_VERSION = '2.0.33';
const LOGO = '<h1 class="logo">fairplan</h1>';
const ICON_PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  plan: 'M6 5h12a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3zM3 10h18M8 3v4M16 3v4',
  stats: 'M5 20V12M12 20V5M19 20v-9',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  back: 'M15 6l-6 6 6 6',
  chevron: 'M9 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  users: 'M12.5 8a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0zM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6',
  away: 'M3 19h18M5 19c0-6 3-10 7-10s7 4 7 10M12 9V5M9.5 5h5',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  star: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  badge: 'M6 6h7a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3zM21.5 6a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0z',
  vibrate: 'M10 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM4 9v6M20 9v6',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  qr: 'M4.5 3h4A1.5 1.5 0 0 1 10 4.5v4A1.5 1.5 0 0 1 8.5 10h-4A1.5 1.5 0 0 1 3 8.5v-4A1.5 1.5 0 0 1 4.5 3zM15.5 3h4A1.5 1.5 0 0 1 21 4.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 14 8.5v-4A1.5 1.5 0 0 1 15.5 3zM4.5 14h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 8.5 21h-4A1.5 1.5 0 0 1 3 19.5v-4A1.5 1.5 0 0 1 4.5 14zM14 14h3v3M21 14v.01M14 21h3M21 17v4',
  db: 'M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM15.5 13a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0z',
};
const icon = (name, size = 24) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICON_PATHS[name]}"></path></svg>`;
// Tier je Personenfarbe
const ANIMALS = {
  blau: { name: 'Wal', fill: 'M3 13.5C3 10 6.5 8.5 10.5 8.5c3.8 0 6 1.7 7.2 3.6L21.5 9.5V16l-3.6-1.6C16.6 16.6 14 18 10.5 18 6 18 3 16.5 3 13.5z', stroke: 'M10.5 7.5V5M8 4.6c1 .1 1.8.6 2.5 1.4.7-.8 1.5-1.3 2.5-1.4', eyes: 'M6 12.6a1 1 0 1 0 2 0a1 1 0 1 0-2 0z', detail: '' },
  rosa: { name: 'Flamingo', fill: 'M9.6 5.2a2.4 2.4 0 1 0 4.8 0a2.4 2.4 0 1 0-4.8 0zM10.2 5.6L3.8 8.4l6.8-1.1z', stroke: 'M14.2 5.6c3 .6 3.4 4 1 6.6-2.4 2.6-3.8 4.6-3.4 8.3', eyes: 'M11.6 4.8a.75 .75 0 1 0 1.5 0a.75 .75 0 1 0-1.5 0z', detail: '' },
  gelb: { name: 'Küken', fill: 'M5 14.2a7 7 0 1 0 14 0a7 7 0 1 0-14 0z', stroke: 'M12 7.2V4.6c0-1.2 1.8-1.2 1.8 0', eyes: 'M8.9 12.7a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0-1.8 0zM13.3 12.7a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0-1.8 0zM10.8 15h2.4L12 16.9z', detail: '' },
  gruen: { name: 'Frosch', fill: 'M3 15.2c0-3.3 3.6-5.4 9-5.4s9 2.1 9 5.4-3.6 5-9 5-9-1.7-9-5zM4.8 8.6a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0zM13.6 8.6a2.8 2.8 0 1 0 5.6 0a2.8 2.8 0 1 0-5.6 0z', stroke: '', eyes: 'M6.5 8.4a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0zM15.3 8.4a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0-2.2 0z', detail: 'M9 15.6c1.8 1.3 4.2 1.3 6 0' },
  violett: { name: 'Qualle', fill: 'M5 12.5a7 7 0 0 1 14 0z', stroke: 'M7.6 15c-.7 1.6.7 2.5 0 4.2M10.5 15c-.7 1.6.7 2.6 0 4.6M13.5 15c-.7 1.6.7 2.6 0 4.6M16.4 15c-.7 1.6.7 2.5 0 4.2', eyes: 'M9.4 10a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0-1.8 0zM12.8 10a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0-1.8 0z', detail: '' },
  orange: { name: 'Fuchs', fill: 'M3.8 4.5l5.2 4h6l5.2-4-.6 9.4L12 20.8 4.4 13.9z', stroke: '', eyes: 'M8.6 12.2a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0-1.8 0zM13.6 12.2a.9 .9 0 1 0 1.8 0a.9 .9 0 1 0-1.8 0zM11 16.4a1 1 0 1 0 2 0a1 1 0 1 0-2 0z', detail: '' },
};
const animalSvg = (color) => {
  const a = ANIMALS[color] || ANIMALS.violett;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${a.fill}" fill="currentColor"></path>${a.stroke ? `<path d="${a.stroke}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"></path>` : ''}<path d="${a.eyes}" style="fill:var(--eye,var(--pc,#fff))"></path>${a.detail ? `<path d="${a.detail}" fill="none" stroke-width="1.4" stroke-linecap="round" style="stroke:var(--eye,var(--pc,#fff))"></path>` : ''}</svg>`;
};
const initial = (p) => (p.name || '?').trim().charAt(0).toUpperCase() || '?';
const avatar = (p, size = '') => {
  const inner = p.avatar === 'photo' && p.photo ? `<img src="${esc(p.photo)}" alt="">` : p.avatar === 'animal' ? animalSvg(p.color) : esc(initial(p));
  const letter = !(p.avatar === 'animal' || (p.avatar === 'photo' && p.photo));
  return `<span class="av ${size} ${letter ? 'letter' : ''}" data-c="${p.color}" style="--pc:var(--c-${p.color})">${inner}</span>`;
};
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
const seasonLabel = (s) => `${MONTHS[s.from - 1]}–${MONTHS[s.to - 1]}${s.from2 != null ? `, ${MONTHS[s.from2 - 1]}–${MONTHS[s.to2 - 1]}` : ''}`;
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
  stack: [], // Unterseiten: woher man gekommen ist
  planMode: 'week',
  planDate: null, // Datum im sichtbaren Plan-Zeitraum, null = heute
  calDay: null, // gewählter Tag im Plan, null = heute
  statMode: 'week',
  addRule: false, // Eingabe „+ Abmachung“ offen
  cheered: true, // beim Öffnen nicht einblenden, nur wenn gerade alles erledigt wurde
  backup: null, // fertig geladene Sicherung, wartet auf „Datei sichern“
  today: localToday(),
  hh: undefined, // undefined = lädt, null = nicht gefunden
  tasks: [],
  tasksLoaded: false,
  comps: new Map(),
  setup: null,
  subs: [],
  compSub: null,
  compSig: '',
  daySub: null, // Erledigungen ab dayFrom (für Karte, Plan, Statistik)
  dayFrom: null,
  dayComps: [],
  open: { rules: ls.get('open-rules') === '1' }, // aufgeklappte Bereiche (details) über Neuzeichnen hinweg
  pendingRender: false,
};

const app = $('#app');
const person = (id) => S.hh?.persons.find((p) => p.id === id);
const pn = (id) => {
  const p = person(id);
  return p ? `<span class="pn"><i class="sw" style="--pc:var(--c-${p.color})"></i>${esc(p.name)}</span>` : '';
};
const byName = (id) => { const p = person(id); return p ? `<span class="by" data-c="${p.color}">${esc(p.name)}</span>` : '?'; };
// „dir“ statt des eigenen Namens: zeigt auch gleich, welche Häkchen man zurücknehmen kann
const byWho = (id) => (id === S.me ? `<span class="by" data-c="${person(id)?.color}">dir</span>` : byName(id));
const timeOf = (c) => new Date(c.at).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
const forWhom = (c) => (c.forPerson && c.forPerson !== c.by ? ` für ${c.forPerson === S.me ? 'dich' : esc(person(c.forPerson)?.name ?? '?')}` : '');

// ---------- Haushalt auf dem Gerät merken ----------

// Code und Person liegen zusätzlich in IndexedDB und einem Cookie: geht localStorage verloren
// (das iPhone schreibt ihn verzögert und kann ihn beim Beenden verlieren), holen wir sie von dort zurück.
const KEEP_DB = 'fairplan-keep';
const withTimeout = (p, ms = 1500) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
function keepStore(mode, fn) {
  return withTimeout(new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(KEEP_DB, 1); } catch { return resolve(); }
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', mode);
      const r = fn(tx.objectStore('kv'));
      tx.oncomplete = () => { db.close(); resolve(r?.result); };
      tx.onerror = tx.onabort = () => { db.close(); resolve(); };
    };
  }));
}
const cookieAttrs = () => `path=${location.pathname.replace(/[^/]*$/, '')};SameSite=Lax${location.protocol === 'https:' ? ';Secure' : ''}`;
function keepIdentity() {
  if (!S.code) return;
  document.cookie = `fairplan=${S.code}.${S.me || ''};max-age=63072000;${cookieAttrs()}`;
  keepStore('readwrite', (st) => st.put({ code: S.code, me: S.me }, 'id')).catch(() => {});
}
function forgetIdentity() {
  document.cookie = `fairplan=;max-age=0;${cookieAttrs()}`;
  return keepStore('readwrite', (st) => st.delete('id')).catch(() => {});
}
async function restoreIdentity() {
  navigator.storage?.persist?.().catch(() => {});
  if (S.code && S.me) return;
  const m = document.cookie.match(/(?:^|; )fairplan=([A-Z0-9]{16})\.(\w*)/);
  const kept = (await keepStore('readonly', (st) => st.get('id')).catch(() => null)) || (m && { code: m[1], me: m[2] || null });
  if (!kept?.code || (S.code && S.code !== kept.code)) return;
  S.code = kept.code;
  ls.set('code', kept.code);
  if (!S.me && kept.me) { S.me = kept.me; ls.set('me', kept.me); }
}

// ---------- Start ----------

init();

async function init() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  await restoreIdentity();
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
    ls.set('accent', null);
    delete document.documentElement.dataset.accent;
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
  keepIdentity();
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

// Erledigungen ab einem Tag laden; der Bereich wächst nur (spart Lesezugriffe).
// Standard 62 Tage für Serie und Woche; Plan und Statistik holen bei Bedarf mehr.
function ensureDays(from) {
  if (S.dayFrom && S.dayFrom <= from) return;
  S.dayFrom = from;
  S.daySub?.();
  S.daySub = S.store.watchDays(S.code, from, '9999-12-31', (list) => { S.dayComps = list.filter((c) => c.step == null); render(); });
}

// ---------- Rendern ----------

// Nicht neu zeichnen, während jemand in ein Feld tippt
app.addEventListener('focusout', () => setTimeout(() => { if (S.pendingRender) render(); }, 0));

// Während ein Finger aufliegt nicht neu zeichnen: sonst verschwindet der Knopf unter dem Finger und der Tipp geht verloren
let pointerDown = false;
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
const pointerEnd = () => {
  pointerDown = false;
  setTimeout(() => { if (S.pendingRender && !pointerDown) render(); }, 50); // nach dem Klick
};
document.addEventListener('pointerup', pointerEnd, true);
document.addEventListener('pointercancel', pointerEnd, true);

let loadTimer;
function render() {
  if (pointerDown) { S.pendingRender = true; return; }
  if (S.setup) return renderSetup();
  const a = document.activeElement;
  if (a && app.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type !== 'checkbox') {
    S.pendingRender = true;
    return;
  }
  S.pendingRender = false;
  if (S.hh === undefined || !S.tasksLoaded) {
    app.innerHTML = '<p class="loading">Fairplan wird geladen …</p>';
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => {
      if (S.hh === undefined || !S.tasksLoaded) {
        app.innerHTML = `<header class="top">${LOGO}</header><p>Keine Verbindung zur Datenbank. Dein Haushalt ist nicht weg, bitte prüfe das Internet.</p>
          <div class="btnrow"><button class="btn primary" onclick="location.reload()">Erneut versuchen</button></div>`;
      }
    }, 15000);
    return;
  }
  if (S.hh === null) {
    app.innerHTML = `<header class="top">${LOGO}</header>
      <p>Dieser Haushalt wurde nicht gefunden.</p>
      <div class="btnrow"><button class="btn primary" data-action="leave">Neu einrichten</button></div>`;
    return;
  }
  if (!person(S.me)) return renderWhoAmI();

  syncAccent();
  const recent = fromDay(toDay(S.today) - 62);
  const year = `${S.today.slice(0, 4)}-01-01`;
  const need = S.view === 'statistik' ? [S.hh.setup, fromDay(toDay(year) - 366), fromDay(toDay(S.today) - 40)].sort()[0]
    : S.view === 'plan' ? [recent, planRange()[0]].sort()[0] : recent;
  ensureDays(need);

  const page = PAGES[S.view];
  const scroll = window.scrollY;
  if (page) {
    app.innerHTML = `<header class="top subtop"><button class="icobtn" data-back aria-label="Zurück">${icon('back', 22)}</button><h1>${typeof page[0] === 'function' ? page[0]() : page[0]}</h1>
      ${S.view === 'profil' ? '<button class="textbtn" data-back>Fertig</button>' : ''}</header>${page[1]()}`;
  } else {
    const me = person(S.me);
    const tabs = TABS.map(([v, l, ic]) => `<button data-view="${v}" ${S.view === v ? 'aria-current="page"' : ''}>${icon(ic)}${l}</button>`).join('');
    app.innerHTML = `<header class="top">${LOGO}<button class="me" data-go="profil" aria-label="Profil öffnen">${avatar(me)}</button></header>
      ${MAIN[S.view]()}
      <nav class="tabs">${tabs}</nav>`;
  }
  window.scrollTo(0, scroll);
  fillQr();
  updateBadge();
}

const TABS = [['heute', 'Aktuell', 'home'], ['plan', 'Plan', 'plan'], ['statistik', 'Statistik', 'stats'], ['mehr', 'Mehr', 'more']];
const MAIN = { heute: () => viewToday(), plan: () => viewPlan(), statistik: () => viewStats(), mehr: () => viewMore() };
const PAGES = {
  profil: ['Profil', () => viewProfile()],
  haushalt: ['Haushalt', () => viewHousehold()],
  code: ['Haushalts-Code', () => viewCode()],
  aufgaben: ['Aufgabenliste', () => viewTasks()],
  abmachungen: ['Abmachungen', () => viewRules()],
  putztag: [() => putztagWord(S.hh.sharedDays, 'Gemeinsamer Putztag', 'Gemeinsame Putztage'), () => viewSharedDay()],
  abwesenheit: ['Abwesenheit', () => viewAway()],
  backup: ['Backup', () => viewBackup()],
  start: ['Start des Plans', () => viewStart()],
};

// Akzent = eigene Personenfarbe; Statusleiste passend zum Hintergrund
function syncAccent() {
  const c = person(S.me)?.color;
  const root = document.documentElement;
  if (c && root.dataset.accent !== c) {
    root.dataset.accent = c;
    ls.set('accent', c);
  }
  $('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue('--bg').trim();
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
      return `erledigt von ${byWho(c.by)}${forWhom(c)} · ${fmtDate(c.day)}, ${timeOf(c)}`;
    }
    case 'need': return '';
    case 'offseason': return `Saison ${seasonLabel(it.task.season)}${it.next ? ` · ab ${fmtDate(it.next)}` : ''}`;
    default: return it.next ? `nächste Fälligkeit ${fmtDate(it.next)}` : '';
  }
}

// lead: was vor dem Status steht – 'owner' (Zuständigkeit), 'shared' (nur „Gemeinsam“) oder 'interval'
function itemRow(it, { lead = 'interval' } = {}) {
  const active = ['due', 'overdue', 'upcoming', 'done', 'need'].includes(it.status);
  const first = lead === 'owner' ? ownerText(it) : lead === 'shared' ? (it.owner === null ? 'Gemeinsam' : '') : intervalLabel(it.task);
  const meta = [first, statusText(it), lead === 'owner' && it.task.min ? `${it.task.min} Min` : ''].filter(Boolean).join(' · ');
  const done = it.status === 'done';
  const locked = done && it.completion?.by !== S.me;
  const cls = [it.status, active ? '' : 'inactive', active && !locked ? '' : 'off'].join(' ');
  return `<div class="item ${cls}" style="--pc:${done ? colorOf(it.completion?.by) : 'var(--accent)'}">
    <label class="check"><input type="checkbox" data-action="toggle" data-task="${esc(it.task.id)}" data-slot="${esc(it.slot ?? '')}"
      ${done ? 'checked' : ''} ${active && !locked ? '' : 'disabled'} aria-label="${esc(it.task.title)} erledigt"><span class="box"></span></label>
    <div class="body"><button class="body-btn" data-edit="${esc(it.task.id)}"><div class="title">${esc(it.task.title)}</div>
      ${it.task.note ? `<div class="note">${esc(it.task.note)}</div>` : ''}
      ${meta ? `<div class="meta">${meta}</div>` : ''}</button></div>
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

// Kachel mit Wisch-Hintergrund: Wischen in beide Richtungen, färbt in der Personenfarbe.
// Fremde Häkchen (locked) lassen sich weder antippen noch wischen.
const swipeRow = ({ done, locked, off, by, check, body }) => `<div class="swipe">
    <div class="swipe-bg ${done ? 'undo' : ''}">${icon('check', 20)}<span>${done ? 'Wieder öffnen' : 'Erledigt'}</span></div>
    <div class="item ${done ? 'done' : ''} ${locked || off ? 'off' : ''}" ${locked || off ? '' : 'data-swipe'} style="--pc:${done ? colorOf(by) : 'var(--accent)'}">
      <label class="check">${check}<span class="box"></span></label>${body}</div>
  </div>`;

// Zeile für „Aktuell“: Intervall klein rechts, Zusatzzeile für Hinweis, Termin oder „Gemeinsam“
function nowRow(it, sub = '') {
  const t = it.task, k = kindOf(t);
  const iv = k === 'custom' ? `alle ${t.n} ${UNIT_LABEL[t.unit][t.n === 1 ? 0 : 1]}` : SHORT_KIND[k];
  const done = it.status === 'done';
  const by = it.completion?.by;
  const locked = done && by !== S.me;
  const off = !it.key; // nächster Termin liegt in einer späteren Periode → noch nicht abhakbar
  const extra = [it.owner === null && !done ? 'Gemeinsam' : '', t.note ? esc(t.note) : '', sub].filter(Boolean).join(' · ');
  return swipeRow({
    done, locked, off, by,
    check: `<input type="checkbox" data-action="toggle" data-task="${esc(t.id)}" data-slot="${esc(it.slot ?? '')}"
      ${done ? 'checked' : ''} ${off || locked ? 'disabled' : ''} aria-label="${esc(t.title)} erledigt">`,
    body: `<div class="body"><div class="head"><span class="title">${esc(t.title)}</span><span class="kind">${iv}</span></div>
      ${extra ? `<div class="meta">${extra}</div>` : ''}${stepsBlock(it)}</div>`,
  });
}

// Vorgeschlagene Abmachungen als Knöpfe zum An-/Abwählen
const ruleChips = (picked, attr) => {
  const chips = (list) => `<div class="filters">${list.map((r) =>
    `<button ${attr}="${esc(r)}" aria-pressed="${picked.includes(r)}">${esc(r)}</button>`).join('')}</div>`;
  return chips(RULE_COMMON) + RULE_GROUPS.map(([key, name, list]) => {
    const n = list.filter((r) => picked.includes(r)).length;
    return fold(`rg-${key}`, `${name}${n ? ` <span class="count bonus">${n}</span>` : ''}`, chips(list));
  }).join('');
};
const ownRules = () => (S.hh.rules || []).filter((r) => !RULE_SUGGESTIONS.includes(r));
const toggled = (list, x) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);

// Abmachung als Zeile: wer zuerst erledigt, hakt für alle ab; Häkchen anderer sind gesperrt
function ruleRow(text) {
  const c = S.comps.get(completionId(ruleId(text), ruleKey(), null));
  const locked = !!c && c.by !== S.me;
  return swipeRow({
    done: !!c, locked, off: false, by: c?.by,
    check: `<input type="checkbox" data-action="toggle-rule" data-rule="${esc(text)}" ${c ? 'checked' : ''} ${locked ? 'disabled' : ''}
      aria-label="${esc(text)} erledigt">`,
    body: `<div class="body"><div class="head"><span class="title">${esc(text)}</span><span class="kind">täglich</span></div>
      ${c ? `<div class="meta">erledigt von ${byWho(c.by)} · ${timeOf(c)}</div>` : ''}</div>`,
  });
}

// Aufklappbarer Bereich; Zustand bleibt beim Neuzeichnen erhalten
function fold(key, summary, body, openByDefault = false) {
  return `<details class="fold" data-fold="${key}" ${S.open[key] ?? openByDefault ? 'open' : ''}><summary>${summary}</summary>${body}</details>`;
}

function section(title, items, { lead, cls = '' } = {}) {
  return `<section class="group ${cls}"><h2>${esc(title)}<span class="count">${items.length}</span></h2>${listOf(items, { lead })}</section>`;
}

const listOf = (items, opts) => (items.length ? `<div class="list">${items.map((i) => itemRow(i, opts)).join('')}</div>` : '');


// Zahl am App-Icon: nicht Geschafftes + jetzt dran (eigenes und gemeinsames), ohne Tägliches
function badgeCount() {
  return allItems().filter((i) => (i.owner === S.me || i.owner === null) && !myPaused(i) && kindOf(i.task) !== 'daily'
    && (i.status === 'overdue' || i.status === 'due')).length;
}
let lastBadge = -1;
function updateBadge() {
  if (!('setAppBadge' in navigator)) return;
  const n = ls.get('badge') === '0' ? 0 : badgeCount();
  if (n === lastBadge) return;
  lastBadge = n;
  (n ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
}

const paused = (w) => (w.owner === null
  ? S.hh.persons.every((p) => awayDuring(S.hh, p.id, toDay(w.start), toDay(w.end)))
  : awayDuring(S.hh, w.owner, toDay(w.start), toDay(w.end)));
const colorOf = (id) => { const p = person(id); return p ? `var(--c-${p.color})` : 'var(--shared)'; };
// Für Punkte und Ringe im Plan: je Darstellung gut sichtbar
const dotOf = (id) => { const p = person(id); return p ? `var(--d-${p.color})` : 'var(--shared)'; };

// ---------- Aktuell ----------

const mineItem = (i) => i.owner === S.me || i.owner === null;
// Eigene vor gemeinsamen, dann nach Rhythmus (täglich → wöchentlich → monatlich …)
const byOwnerRhythm = (a, b) => (a.owner === S.me ? 0 : 1) - (b.owner === S.me ? 0 : 1)
  || kindRank(a.task) - kindRank(b.task) || (a.due || '').localeCompare(b.due || '') || (a.task.order ?? 0) - (b.task.order ?? 0);
const weekStart = () => fromDay(toDay(S.today) - weekdayOf(S.today));
const doneMap = () => new Map([...S.dayComps.map((c) => [c.id, c]), ...S.comps]);
const myDays = () => S.dayComps.filter((c) => c.by === S.me);
const isAway = (id, day) => { const a = S.hh.away?.[id]; return !!(a?.from && a?.to && a.from <= day && day <= a.to); };
const myStreaks = () => streaks(myDays().map((c) => c.day), S.today, (d) => isAway(S.me, d));
const daysText = (n) => (n ? `${n} ${n === 1 ? 'Tag' : 'Tage'}` : 'Noch keine');

// Eigene Aufgaben pausieren, solange man heute abwesend ist oder ihr Termin in die Abwesenheit fällt.
// Andere sehen sie weiter und können vertreten.
const myPaused = (i) => i.owner === S.me && i.due && i.end
  && (isAway(S.me, S.today) || awayDuring(S.hh, S.me, toDay(i.due), toDay(i.end)));

function viewToday() {
  const items = allItems();
  const sun = weekEnd(), mon = weekStart();
  const open = items.filter((i) => i.status === 'due' || i.status === 'overdue' || i.status === 'upcoming');
  // Aufgaben: Vergessenes, jetzt Dranes und was diese Woche noch kommt (lässt sich schon vorher abhaken)
  const tasks = open.filter((i) => mineItem(i) && !myPaused(i) && (i.status !== 'upcoming' || i.due <= sun))
    .sort((a, b) => (a.status === 'upcoming' ? 1 : 0) - (b.status === 'upcoming' ? 1 : 0) || byOwnerRhythm(a, b));
  const now = tasks.filter((i) => i.status !== 'upcoming');
  const need = items.filter((i) => mineItem(i) && i.status === 'need').sort(byOwnerRhythm);

  const rules = (S.hh.rules || []).filter((r) => r && inSeason(RULE_SEASONS[r], +S.today.slice(5, 7)));
  const ruleDone = (r) => S.comps.get(completionId(ruleId(r), ruleKey(), null));
  const openRules = rules.filter((r) => !ruleDone(r));
  const doneRules = rules.filter(ruleDone);
  const bonusToday = doneRules.filter((r) => ruleDone(r).by === S.me).length;
  const doneToday = items.filter((i) => i.status === 'done' && i.completion?.day === S.today).sort(byOwnerRhythm);

  // Statuskarte: heute x/y; Balken = Woche Mo–So mit Vergessenem; Abmachungen nur als „extra“ daneben
  const x = doneToday.filter((i) => i.completion.by === S.me && kindOf(i.task) !== 'asneeded').length;
  const y = x + now.length;
  const week = dueBetween(S.tasks, S.hh, mon, sun, doneMap(), S.me);
  const forgotten = now.filter((i) => i.status === 'overdue' && i.due < mon).length;
  const weekDone = week.filter((w) => w.done).length;
  const weekAll = week.length + forgotten;
  const inWeek = myDays().filter((c) => c.day >= mon && c.day <= sun);
  const bonus = inWeek.filter((c) => c.rule).length;
  const weekCount = inWeek.length - bonus;
  const { current } = myStreaks();
  const streakText = S.dayFrom > S.hh.setup && current >= 60 ? '60+ Tage' : daysText(current);

  const next = items.filter((i) => mineItem(i) && !['daily', 'asneeded'].includes(kindOf(i.task)))
    .map((i) => ({ title: i.task.title, date: i.status === 'upcoming' ? i.due : i.next }))
    .filter((n) => n.date && n.date > S.today).sort((a, b) => a.date.localeCompare(b.date))[0];
  const away = S.hh.away?.[S.me];
  const meAway = away?.from && away.from <= S.today && S.today <= away.to;
  const allDone = !now.length && x > 0;
  const me = person(S.me);
  const swap = nextSwap(S.hh, S.today);

  const card = `${swapNote()}<section class="card ${allDone ? 'alldone' : ''}">
      <div><span class="card-label">Deine Aufgaben heute</span>
        <span class="card-big">${x}<small> / ${y}</small></span></div>
      ${weekAll || bonus ? `<div><div class="bar-head"><span>${weekAll ? `Diese Woche ${weekDone} von ${weekAll}` : 'Diese Woche nichts geplant'}</span>${bonus ? `<span class="pill">+${bonus} extra</span>` : ''}</div>
        ${weekAll ? `<div class="bar"><i style="width:${Math.round((weekDone / weekAll) * 100)}%"></i></div>` : ''}</div>` : ''}
      <span class="card-open">${meAway ? `Du bist bis ${fmtDate(away.to)} abwesend, deine Aufgaben pausieren.` : allDone ? 'Alles erledigt – stark gemacht!' : now.length ? `Noch ${now.length} offen` : 'Heute ist nichts dran.'}</span>
      ${next ? `<span class="card-next">Als Nächstes: ${esc(next.title)}, ab ${dayLabel(next.date)}</span>` : ''}
      ${swap && toDay(swap) - toDay(S.today) <= 3 ? `<span class="card-next">Tausch am ${fmtDate(swap)}</span>` : ''}
      <hr>
      <div class="duo"><div><span>Deine Woche</span><b>${weekCount} erledigt</b></div>
        <div><span>Serie</span><b>${current ? `${streakText} in Folge` : streakText}</b></div></div>
    </section>
    ${allDone && !meAway ? `<section class="cheer ${S.cheered ? '' : 'pop'}">${animalSvg(me.color)}<b>Alles erledigt</b><span>Genieß den Tag.</span></section>` : ''}`;
  S.cheered = allDone; // Tier nur beim ersten Mal einblenden, nicht bei jedem Neuzeichnen

  const rows = (list, sub = whenText) => `<div class="list">${list.map((i) => nowRow(i, sub(i))).join('')}</div>`;
  const head = (name, n, cls = '') => `${name} <span class="count ${cls}">${n}</span>`;

  // Andere Personen: eingeklappt, abhaken = Vertretung
  const others = S.hh.persons.filter((p) => p.id !== S.me).map((p) => {
    const list = open.filter((i) => i.owner === p.id && i.status !== 'upcoming').sort(byOwnerRhythm);
    return list.length ? fold(`other-${p.id}`, head(esc(p.name), list.length), rows(list)) : '';
  }).join('');

  const doneRows = [
    ...doneRules.map((r) => [0, ruleRow(r)]),
    ...doneToday.map((i) => [kindRank(i.task), nowRow(i, doneText(i))]),
  ].sort((a, b) => a[0] - b[0]).map((r) => r[1]).join('');

  return `${card}
    ${rules.length ? fold('rules', `${head('Abmachungen', openRules.length)}${bonusToday ? `<span class="count bonus">+${bonusToday} extra</span>` : ''}`, `<p class="small">Erledigt ihr nebenbei, so wie abgemacht. Wird nicht aufgeteilt, zählt aber in deiner Statistik.</p><div class="list">${openRules.map(ruleRow).join('')}</div>`) : ''}
    ${fold('tasks', head('Aufgaben', tasks.length), rows(tasks), true)}
    ${need.length ? fold('need', head('Bei Bedarf', need.length), `<p class="small">Taucht nur auf, wenn ihr es braucht.</p>${rows(need, () => '')}`) : ''}
    ${others}
    ${doneRows ? fold('done', head('Erledigt', doneRules.length + doneToday.length), `<div class="list">${doneRows}</div>`) : ''}`;
}

const doneText = (it) => `erledigt von ${byWho(it.completion.by)}${forWhom(it.completion)} · ${timeOf(it.completion)}`;

// ---------- Aufgabenliste (Mehr) ----------

function filterBar() {
  const f = S.filter;
  return [['all', 'Alle'], ...S.hh.persons.map((p) => [p.id, p.name]), ['shared', 'Gemeinsam']]
    .map(([v, l]) => `<button data-filter="${esc(v)}" aria-pressed="${f === v}">${esc(l)}</button>`).join('');
}

function kindBar() {
  return [['all', 'Alle Intervalle'], ...KINDS.filter((k) => S.tasks.some((t) => kindOf(t) === k)).map((k) => [k, KIND_LABEL[k]])]
    .map(([v, l]) => `<button data-kind-filter="${v}" aria-pressed="${S.kindFilter === v}">${esc(l)}</button>`).join('');
}

// Hinweis nach dem Tausch: einmal pro Monat und Gerät, zum Wegtippen
function swapNote() {
  const turns = swapCount(S.hh, S.today);
  if (!turns || ls.get('swap-seen') === S.today.slice(0, 7)) return '';
  const pkg = packageOwners(S.hh, turns)[0] === S.me ? 'A' : packageOwners(S.hh, turns)[1] === S.me ? 'B' : null;
  const mine = S.tasks.filter((t) => t.assign === pkg && !t.fixed && !(t.unit === 'month' && t.n % 2 === 0));
  const weekly = mine.filter((t) => kindOf(t) === 'weekly').map((t) => esc(t.title));
  const rest = mine.length - weekly.length;
  const list = weekly.length ? `${weekly.join(', ')}${rest ? ` und ${rest} weitere` : ''}` : `${rest} Aufgaben`;
  return `<button class="awaynote swapnote" data-action="swap-seen" style="--pc:var(--accent)">Getauscht! Du hast jetzt: ${list}</button>`;
}

function viewTasks() {
  const f = S.filter, kf = S.kindFilter;
  const items = allItems().filter((i) => (f === 'all' || (f === 'shared' ? i.owner === null : i.owner === f))
    && (kf === 'all' || kindOf(i.task) === kf));
  const groups = KINDS.map((k) => {
    const g = sortItems(items.filter((i) => kindOf(i.task) === k));
    return g.length ? section(KIND_LABEL[k], g, { lead: 'owner' }) : '';
  }).join('');
  const load = loadByPerson(S.tasks, S.hh)[S.me] || 0;
  return `<div class="btnrow" style="margin-top:18px"><button class="btn primary block" data-edit="">${icon('plus', 18)}Aufgabe hinzufügen</button></div>
    <div class="filters">${filterBar()}</div><div class="filters">${kindBar()}</div>
    <p class="small">Dein Aufwand pro Monat: ${hours(load)} h</p>
    ${groups || '<p class="none" style="margin-top:24px">Keine Aufgaben.</p>'}`;
}

// ---------- Plan ----------

const planAnchor = () => S.planDate || S.today;
function planRange() {
  const a = planAnchor();
  if (S.planMode === 'week') {
    const from = toDay(a) - weekdayOf(a);
    return [fromDay(from), fromDay(from + 6)];
  }
  const [y, m] = a.split('-').map(Number);
  const first = `${a.slice(0, 7)}-01`;
  return [first, fromDay(toDay(first) + new Date(y, m, 0).getDate() - 1)];
}
const shortMonth = (s) => asDate(s).toLocaleDateString('de-AT', { month: 'short' }).replace('.', '');
const compRhythm = (c) => {
  if (c.rule) return 'Abmachung';
  const t = S.tasks.find((x) => x.id === c.taskId);
  return t ? KIND_LABEL[kindOf(t)] : '';
};

function viewPlan() {
  const [from, to] = planRange();
  const isWeek = S.planMode === 'week';
  const sel = S.calDay || S.today;
  const doneOn = new Map();
  for (const c of S.dayComps) { if (!doneOn.has(c.day)) doneOn.set(c.day, []); doneOn.get(c.day).push(c); }
  const hol = new Map([...holidays(+from.slice(0, 4)), ...holidays(+to.slice(0, 4))]);
  const planned = new Map(); // Tag → Zuständige (null = gemeinsam), ohne Tägliches
  for (const w of S.tasks.flatMap((t) => windowsBetween(t, S.hh, from, to))) {
    if (kindOf(w.task) === 'daily') continue;
    if (!planned.has(w.start)) planned.set(w.start, new Set());
    planned.get(w.start).add(w.owner);
  }

  // Gefüllter Punkt: hat an dem Tag etwas erledigt. Ring (ab heute): hat Putztag oder Aufgaben, grau = Gemeinsames.
  const cell = (ds) => {
    const done = doneOn.get(ds) || [];
    const owners = planned.get(ds) || new Set();
    const rings = ds < S.today || ds < S.hh.setup ? '' : [
      ...S.hh.persons.filter((p) => !isAway(p.id, ds) && ((p.days?.length ? p.days : [5]).includes(weekdayOf(ds)) || owners.has(p.id)))
        .map((p) => `<i class="ring-dot" style="--pc:var(--d-${p.color})"></i>`),
      owners.has(null) ? '<i class="ring-dot" style="--pc:var(--shared)"></i>' : '',
    ].join('');
    const dots = S.hh.persons.filter((p) => done.some((c) => c.by === p.id)).map((p) => `<i style="--pc:var(--d-${p.color})"></i>`).join('') + rings;
    const away = S.hh.persons.find((p) => isAway(p.id, ds));
    const cls = [ds === S.today ? 'today' : '', ds === sel ? 'sel' : '', hol.has(ds) ? 'holiday' : '', away ? 'away' : ''].join(' ');
    const label = asDate(ds).toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
    return `<button class="day ${cls}" data-pick-day="${ds}" aria-pressed="${ds === sel}" aria-label="${label}" ${away ? `style="--pc:var(--c-${away.color})"` : ''}>
      ${isWeek ? `<small>${WEEKDAYS[weekdayOf(ds)]}</small>` : ''}<span>${asDate(ds).getDate()}</span><span class="dots">${dots}</span></button>`;
  };
  const cells = [];
  if (!isWeek) for (let i = 0; i < weekdayOf(from); i++) cells.push('<span class="day blank"></span>');
  for (let d = toDay(from); d <= toDay(to); d++) cells.push(cell(fromDay(d)));
  const title = isWeek
    ? `${asDate(from).getDate()}. ${shortMonth(from)} – ${asDate(to).getDate()}. ${shortMonth(to)}`
    : asDate(from).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });

  return `<div class="seg"><button data-plan-mode="week" aria-pressed="${isWeek}">Woche</button><button data-plan-mode="month" aria-pressed="${!isWeek}">Monat</button></div>
    <div class="calhead"><button class="navbtn" data-plan-nav="-1" aria-label="Zurück">${icon('back', 20)}</button><strong>${title}</strong><button class="navbtn" data-plan-nav="1" aria-label="Weiter">${icon('chevron', 20)}</button></div>
    ${isWeek ? '' : `<div class="cal-grid">${WEEKDAYS.map((w) => `<span class="wd">${w}</span>`).join('')}</div>`}
    <div class="cal-grid ${isWeek ? 'week' : ''}">${cells.join('')}</div>
    ${dayDetail(sel, doneOn, hol.get(sel))}
    ${nextTwoWeeks()}`;
}

// Im Plan: eigene zuerst, dann gemeinsame, dann die der anderen; innerhalb nach Rhythmus
const meRank = (w) => (w.owner === S.me ? 0 : w.owner === null ? 1 : 2 + S.hh.persons.findIndex((p) => p.id === w.owner));
const byMeFirst = (a, b) => meRank(a) - meRank(b) || kindRank(a.task) - kindRank(b.task);

// Tagesdetail: Erledigtes (wer, was, wann; eigene rückgängig) und Geplantes bzw. offen Gebliebenes
function dayDetail(sel, doneOn, holiday) {
  const past = sel < S.today;
  const byId = doneMap();
  const wins = S.tasks.flatMap((t) => windowsBetween(t, S.hh, sel, sel)).filter((w) => kindOf(w.task) !== 'daily'
    && !byId.has(completionId(w.task.id, w.key, w.slot)) && !paused(w)
    && (past ? w.end === sel && w.start >= S.dayFrom : sel === S.today ? w.start <= sel : w.start === sel));
  wins.sort(byMeFirst);
  const done = (doneOn.get(sel) || []).slice().sort((a, b) => a.at.localeCompare(b.at));

  const planned = wins.map((w) => {
    const p = person(w.owner);
    return `<div class="drow"><span class="ring" style="--pc:${dotOf(w.owner)}"></span><span class="t">${esc(w.task.title)}</span>
      <span class="who">${p ? byName(p.id) : 'Gemeinsam'}</span></div>`;
  }).join('');
  const doneRows = done.map((c) => {
    const p = person(c.by);
    const time = timeOf(c);
    const proxy = c.forPerson && c.forPerson !== c.by ? ` · für ${esc(person(c.forPerson)?.name ?? '?')}` : '';
    const rh = compRhythm(c);
    return `<div class="drow">${p ? avatar(p, 's') : ''}<span class="t">${esc(c.title)}<small>${esc(p?.name ?? '?')}${rh ? ` · ${rh}` : ''}${proxy}</small></span>
      <time>${time}</time>${c.by === S.me ? `<button class="minibtn" data-reopen="${esc(c.id)}">Rückgängig</button>` : ''}</div>`;
  }).join('');
  const awayP = S.hh.persons.filter((p) => isAway(p.id, sel));
  const idle = sel < S.today || sel < S.hh.setup ? [] : S.hh.persons.filter((p) => !isAway(p.id, sel)
    && (p.days?.length ? p.days : [5]).includes(weekdayOf(sel)) && !wins.some((w) => w.owner === p.id));
  const dayName = sel === S.today ? 'Heute' : WEEKDAYS_LONG[weekdayOf(sel)];
  return `<h2>${dayName}, ${asDate(sel).getDate()}. ${shortMonth(sel)}${holiday ? ` · ${esc(holiday)}` : ''}</h2>
    ${awayP.map((p) => `<div class="awaynote" style="--pc:var(--c-${p.color})">${esc(p.name)} ist abwesend</div>`).join('')}
    ${planned ? `${past ? '<p class="none">Offen geblieben</p>' : ''}<div class="tile">${planned}</div>` : ''}
    ${doneRows ? `<div class="tile">${doneRows}</div>` : ''}
    ${idle.length ? `<p class="none">Putztag von ${idle.map((p) => esc(p.name)).join(', ').replace(/, ([^,]*)$/, ' und $1')}, nichts geplant.</p>` : ''}
    ${planned || doneRows || awayP.length || idle.length ? '' : '<p class="none">Nichts an diesem Tag.</p>'}`;
}

// Nächste 2 Wochen: kommende Aufgaben ohne Tägliches, Abwesenheiten in Personenfarbe
function nextTwoWeeks() {
  const first = toDay(S.today) + 1, last = first + 13;
  const byId = doneMap();
  const days = new Map();
  const add = (ds, html) => { if (!days.has(ds)) days.set(ds, []); days.get(ds).push(html); };
  for (const p of S.hh.persons) {
    const a = S.hh.away?.[p.id];
    if (!a?.from || !a?.to || toDay(a.to) < first || toDay(a.from) > last) continue;
    add(fromDay(Math.max(first, toDay(a.from))), `<li class="away"><i style="--pc:var(--d-${p.color})"></i><span class="by" data-c="${p.color}">${esc(p.name)} abwesend bis ${fmtDate(a.to)}</span></li>`);
  }
  const wins = S.tasks.flatMap((t) => windowsBetween(t, S.hh, fromDay(first), fromDay(last)))
    .filter((w) => kindOf(w.task) !== 'daily' && toDay(w.start) >= first && !byId.has(completionId(w.task.id, w.key, w.slot)) && !paused(w))
    .sort(byMeFirst);
  for (const w of wins) add(w.start, `<li><i style="--pc:${dotOf(w.owner)}"></i><span>${esc(w.task.title)}</span></li>`);
  const rows = [...days.keys()].sort().map((ds) => `<div class="urow"><div class="d"><small>${WEEKDAYS[weekdayOf(ds)]}</small><b>${fmtDate(ds, false)}</b></div><ul>${days.get(ds).join('')}</ul></div>`).join('');
  return `<h2>Nächste 2 Wochen</h2>${rows ? `<div class="tile pad">${rows}</div><span class="hint">Ohne tägliche Aufgaben.</span>` : '<p class="none">Nichts geplant.</p>'}`;
}

// ---------- Statistik (nur eigene Zahlen) ----------

const MILESTONES = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  flame: 'M12 3c1 3.5 4.5 5 4.5 9.5A4.5 4.5 0 0 1 7.5 12.5c0-2 1-3.5 2-4.5.3 2 1.5 3 2.5 3 0-3-1-5.5 0-8z',
  cup: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3',
  star: 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z',
  cal: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
};

function monthBounds(s) {
  const [y, m] = s.split('-').map(Number);
  const first = `${s.slice(0, 7)}-01`;
  return [first, fromDay(toDay(first) + new Date(y, m, 0).getDate() - 1)];
}

function statPeriod() {
  const today = S.today, year = +today.slice(0, 4);
  const count = (list, a, b) => list.filter((c) => c.day >= a && c.day <= b).length;
  if (S.statMode === 'month') {
    const [a, b] = monthBounds(today);
    const bars = [];
    for (let d = toDay(a) - weekdayOf(a); d <= toDay(b); d += 7) {
      const s = fromDay(d), e = fromDay(d + 6);
      bars.push({ label: `KW ${isoWeek(d).week}`, from: s < a ? a : s, to: e > b ? b : e, now: s <= today && today <= e });
    }
    const [pa, pb] = monthBounds(fromDay(toDay(a) - 1));
    return { from: a, to: b, prev: [pa, pb], bars, count, label: `Im ${asDate(a).toLocaleDateString('de-AT', { month: 'long' })} erledigt`, unit: 'letzten Monat' };
  }
  if (S.statMode === 'year') {
    const bars = Array.from({ length: 12 }, (_, i) => {
      const s = `${year}-${String(i + 1).padStart(2, '0')}-01`;
      const [ma, mb] = monthBounds(s);
      return { label: MONTHS[i][0], from: ma, to: mb, now: today >= ma && today <= mb };
    });
    return { from: `${year}-01-01`, to: `${year}-12-31`, prev: [`${year - 1}-01-01`, `${year - 1}-12-31`], bars, count, label: `${year} erledigt`, unit: 'im Vorjahr' };
  }
  const a = weekStart();
  const bars = WEEKDAYS.map((w, i) => { const s = fromDay(toDay(a) + i); return { label: w, from: s, to: s, now: s === today }; });
  return { from: a, to: weekEnd(), prev: [fromDay(toDay(a) - 7), fromDay(toDay(a) - 1)], bars, count, label: 'Diese Woche erledigt', unit: 'letzte Woche' };
}

function viewStats() {
  const mine = S.dayComps.filter((c) => c.by === S.me);
  const tasks = mine.filter((c) => !c.rule), rules = mine.filter((c) => c.rule);
  const P = statPeriod();
  const done = P.count(tasks, P.from, P.to);
  const bonus = P.count(rules, P.from, P.to);
  const before = P.count(tasks, P.prev[0], P.prev[1]);
  const diff = done - before;
  const trend = !done && !before ? 'Der erste Haken wartet schon.'
    : !before ? 'Schön, dass du dran bist.'
      : diff > 0 ? `${diff} mehr als ${P.unit} – weiter so!`
        : diff === 0 ? `Gleich viel wie ${P.unit}.` : `${P.unit[0].toUpperCase()}${P.unit.slice(1)}: ${before}.`;
  const vals = P.bars.map((b) => P.count(tasks, b.from, b.to));
  const max = Math.max(1, ...vals);
  const bars = P.bars.map((b, i) => `<div class="${b.now ? 'now' : ''}"><span>${vals[i] || ''}</span><i class="${vals[i] ? '' : 'zero'}" style="height:${vals[i] ? Math.max(8, Math.round((vals[i] / max) * 76)) : 4}px"></i><em>${b.label}</em></div>`).join('');

  const { current, longest } = myStreaks();
  const byId = doneMap();
  const end = P.to < S.today ? P.to : S.today;
  const due = dueBetween(S.tasks, S.hh, P.from, end, byId, S.me);
  const rhythm = KINDS.map((k) => {
    const g = due.filter((w) => kindOf(w.task) === k);
    if (!g.length) return '';
    const n = g.filter((w) => w.done).length;
    return `<div class="rrow"><div><b>${KIND_LABEL[k]}</b><span>${n} von ${g.length}</span></div><div class="bar thin"><i style="width:${Math.round((n / g.length) * 100)}%"></i></div></div>`;
  }).join('');

  // Meilensteine: erreicht in Personenfarbe, offen grau mit „noch X“
  const left = (n, goal) => (n >= goal ? 'geschafft' : `noch ${goal - n}`);
  const sinceStart = toDay(S.today) - toDay(S.hh.setup);
  const months = [];
  for (let d = toDay(monthBounds(S.hh.setup)[0]); d < toDay(monthBounds(S.today)[0]); d = toDay(monthBounds(fromDay(d))[1]) + 1) months.push(monthBounds(fromDay(d)));
  const wholeMonth = months.slice(-24).some(([a, b]) => { const l = dueBetween(S.tasks, S.hh, a, b, byId, S.me); return l.length && l.every((w) => w.done); });
  const badges = [
    ['Erste Woche', sinceStart >= 7, left(sinceStart, 7), MILESTONES.check],
    ['7 Tage Serie', longest >= 7, left(longest, 7), MILESTONES.flame],
    ['100 Aufgaben', tasks.length >= 100, left(tasks.length, 100), MILESTONES.cup],
    ['30 Tage Serie', longest >= 30, left(longest, 30), MILESTONES.flame],
    ['100 extra', rules.length >= 100, left(rules.length, 100), MILESTONES.star],
    ['Ganzer Monat', wholeMonth, wholeMonth ? 'geschafft' : 'läuft', MILESTONES.cal],
  ].map(([name, on, sub, path]) => `<div class="badge ${on ? 'on' : ''}"><i><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"></path></svg></i><b>${name}</b><small>${sub}</small></div>`).join('');

  const seg = [['week', 'Woche'], ['month', 'Monat'], ['year', 'Jahr']].map(([v, l]) => `<button data-stat-mode="${v}" aria-pressed="${S.statMode === v}">${l}</button>`).join('');
  return `<div class="seg">${seg}</div>
    <section class="card">
      <div class="card-top"><div><span class="card-label">${P.label}</span><span class="card-big">${done}</span></div><span class="pill">+${bonus} extra</span></div>
      <div class="bars">${bars}</div>
      <span class="card-open">${trend}</span>
    </section>
    <div class="tiles2"><div class="stat"><span>Aktuelle Serie</span><b class="a">${daysText(current)}</b></div><div class="stat"><span>Längste Serie</span><b>${daysText(longest)}</b></div></div>
    ${rhythm ? `<h2>Nach Rhythmus</h2><div class="tile pad">${rhythm}</div>` : ''}
    <h2>Meilensteine</h2><div class="badges">${badges}</div>`;
}

// ---------- Mehr ----------

const goRow = (go, ic, label, value = '', cls = '') => `<button class="mrow" data-go="${go}"><span class="ic ${cls}">${icon(ic, 18)}</span><span class="l">${label}</span>${value !== '' ? `<span class="v">${value}</span>` : ''}<span class="chev">${icon('chevron', 16)}</span></button>`;
const switchLine = (key, ic, label, hint, on, disabled = false) => `<div class="mrow"><span class="ic">${icon(ic, 18)}</span><label class="l" for="sw-${key}">${label}${hint ? `<small>${hint}</small>` : ''}</label>
  <span class="toggle"><input type="checkbox" id="sw-${key}" role="switch" data-switch="${key}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span></span></span></div>`;

function badgeRow() {
  if (!('setAppBadge' in navigator)) return switchLine('badge', 'badge', 'Zahl am App-Icon', 'Nur vom Home-Bildschirm möglich', false, true);
  const perm = 'Notification' in window ? Notification.permission : 'granted';
  if (perm === 'denied') return switchLine('badge', 'badge', 'Zahl am App-Icon', 'Gesperrt: Einstellungen → Mitteilungen → Fairplan', false, true);
  return switchLine('badge', 'badge', 'Zahl am App-Icon', 'Offenes ohne Tägliches', perm === 'granted' && ls.get('badge') !== '0');
}

function viewMore() {
  const hh = S.hh, me = person(S.me);
  const awayNames = hh.persons.filter((p) => hh.away?.[p.id]?.to >= S.today).map((p) => esc(p.name)).join(', ');
  const shared = sharedDaysOf(hh).map((d) => WEEKDAYS[d]).join(', ');
  const themes = [['auto', 'Auto'], ['dark', 'Dunkel'], ['light', 'Hell'], ['zart', 'Farbe']]
    .map(([v, l]) => `<button data-theme-set="${v}" aria-pressed="${theme() === v}">${l}</button>`).join('');
  return `<button class="ptile" data-go="profil">${avatar(me, 'l')}<span>${esc(me.name)}</span><span class="chev">${icon('chevron', 18)}</span></button>
    <h2>Wir</h2><div class="tile">
      ${goRow('haushalt', 'users', 'Haushalt')}
      ${goRow('putztag', 'plan', putztagWord(hh.sharedDays, 'Gemeinsamer Putztag', 'Gemeinsame Putztage'), shared)}
      ${goRow('abwesenheit', 'away', 'Abwesenheit', awayNames || 'Keine')}
    </div>
    <h2>Aufgaben</h2><div class="tile">
      ${goRow('aufgaben', 'list', 'Aufgabenliste', S.tasks.length)}
      ${goRow('abmachungen', 'star', 'Abmachungen', (hh.rules || []).length, 'a')}
      ${switchLine('rotate', 'refresh', 'Monatlich tauschen', hh.rotateFrom ? `Nächster Tausch am ${fmtDate(nextSwap(hh, S.today))}` : 'Aufgaben bleiben fix bei einer Person', !!hh.rotateFrom)}
      <button class="mrow" data-action="reset-plan"><span class="ic">${icon('refresh', 18)}</span><span class="l">Plan neu einrichten</span><span class="chev">${icon('chevron', 16)}</span></button>
    </div>
    <h2>Dieses Gerät</h2><div class="tile">
      ${badgeRow()}
      ${canHaptic ? switchLine('vibrate', 'vibrate', 'Beim Abhaken vibrieren', '', ls.get('vibrate') !== '0') : ''}
      <div class="mrow"><span class="ic">${icon('moon', 18)}</span><span class="l">Darstellung</span><div class="seg tiny">${themes}</div></div>
    </div>
    <h2>Verwaltung</h2><div class="tile">
      ${goRow('code', 'qr', 'Haushalts-Code')}
      ${goRow('backup', 'db', 'Backup', 'Export · Import')}
      ${goRow('start', 'flag', 'Start des Plans', fmtDate(hh.setup, true))}
    </div>
    <button class="logout" data-action="leave">Auf diesem Gerät abmelden</button>
    <p class="version">fairplan · Version ${APP_VERSION} · ${standalone() ? 'App' : 'Browser'}</p>`;
}

// Ein Putztag oder mehrere: das Wort passt sich an
const putztagWord = (days, one, many) => ((days?.length || 1) === 1 ? one : many);
const sharedDaysOf = (hh) => (hh.sharedDays?.length ? hh.sharedDays : [5]);

// Farbwahl wie im Profil: Tier in der Farbe, bereits vergebene ausgegraut
const colorGrid = (current, takenBy, attr) => `<div class="colors">${COLORS.map(([c, l]) => {
  const owner = takenBy(c);
  return `<button ${attr} data-color="${c}" data-c="${c}" aria-pressed="${current === c}" ${owner ? 'disabled' : ''} aria-label="${l}${owner?.name ? `, vergeben an ${esc(owner.name)}` : ''}">${animalSvg(c)}<span>${l}${owner ? '<small>vergeben</small>' : ''}</span></button>`;
}).join('')}</div>`;

function viewProfile() {
  const hh = S.hh, me = person(S.me), idx = hh.persons.indexOf(me);
  const kind = me.avatar === 'photo' && !me.photo ? 'letter' : me.avatar || 'letter';
  return `<div class="pwrap"><div class="pav">${avatar(me, 'xl')}
      <button class="cam" data-action="photo" aria-label="Foto wählen">${icon('camera', 17)}</button>
      <input type="file" id="photoFile" accept="image/*" hidden></div>
    <div class="avopts">
      <button data-avatar="letter" aria-pressed="${kind === 'letter'}" aria-label="Anfangsbuchstabe">${esc(initial(me))}</button>
      <button data-avatar="animal" aria-pressed="${kind === 'animal'}" aria-label="${ANIMALS[me.color]?.name ?? 'Tier'}">${animalSvg(me.color)}</button>
      ${me.photo ? `<button data-avatar="photo" aria-pressed="${kind === 'photo'}" aria-label="Foto"><img src="${esc(me.photo)}" alt=""></button>` : ''}
    </div>
    ${me.photo ? '<button class="textbtn danger" data-action="del-photo">Foto löschen</button>' : ''}</div>
    <h2><label for="pname">Name</label></h2>
    <input type="text" id="pname" data-person-name="${idx}" value="${esc(me.name)}" maxlength="30">
    <h2>Deine Farbe</h2>${colorGrid(me.color, (c) => hh.persons.find((p) => p.color === c && p.id !== S.me), `data-person-color="${idx}"`)}
    <h2>${putztagWord(me.days, 'Dein Putztag', 'Deine Putztage')}</h2>${dayChips(me.days?.length ? me.days : [5], `data-person-day="${idx}"`)}
    <span class="hint">Ein oder mehrere Tage, an denen deine Aufgaben dran sind.</span>`;
}

function viewHousehold() {
  const rows = S.hh.persons.map((p) => (p.id === S.me
    ? `<button class="mrow" data-go="profil">${avatar(p, 'm')}<span class="l">${esc(p.name)}<small>du</small></span><span class="chev">${icon('chevron', 16)}</span></button>`
    : `<div class="mrow">${avatar(p, 'm')}<span class="l">${esc(p.name)}</span></div>`)).join('');
  return `<h2>Personen</h2><div class="tile">${rows}</div>
    <span class="hint">Jede Person ändert Name und Farbe in ihrem eigenen Profil.</span>
    <button class="addrow" data-go="code">${icon('plus', 18)}Person einladen</button>`;
}

function viewCode() {
  return `<div class="qrwrap"><div class="qr" id="qr" aria-label="QR-Code zum Beitreten"></div>
      <span class="small">Code</span><span class="qrcode">${formatCode(S.code)}</span>
      <p>Zum Beitreten den QR-Code scannen oder den Code eingeben. Nicht öffentlich teilen.</p></div>
    <div class="btnrow" style="margin-top:20px"><button class="btn" data-action="copy">Kopieren</button>${navigator.share ? '<button class="btn" data-action="share">Teilen</button>' : '<button class="btn" data-action="copy-link">Link kopieren</button>'}</div>
    ${S.store.mode === 'local' ? '<p class="small"><span class="ov">Lokaler Testmodus:</span> config.js ist nicht befüllt, Daten liegen nur auf diesem Gerät.</p>' : ''}`;
}

const viewSharedDay = () => `<h2>${putztagWord(S.hh.sharedDays, 'An diesem Tag', 'An diesen Tagen')}</h2>${dayChips(sharedDaysOf(S.hh), 'data-shared-day')}
  <span class="hint">Hier ist Gemeinsames dran, ein oder mehrere Tage.</span>`;

function viewAway() {
  const rows = S.hh.persons.map((p) => {
    const a = S.hh.away?.[p.id] || {};
    return `<h2>${esc(p.name)}${p.id === S.me ? ' (du)' : ''}</h2>
      <div class="inline"><label class="field">von<input type="date" data-away-from="${p.id}" value="${esc(a.from || '')}"></label>
        <label class="field">bis<input type="date" data-away-to="${p.id}" value="${esc(a.to || '')}"></label></div>
      ${a.from || a.to ? `<button class="btn block" data-away-clear="${p.id}">Abwesenheit löschen</button>` : ''}`;
  }).join('');
  return `${rows}<span class="hint">In dieser Zeit pausieren die eigenen Aufgaben: nichts wird „vergessen“. Gemeinsames pausiert nur, wenn beide weg sind.</span>`;
}

const viewRules = () => {
  const own = ownRules();
  return `<h2>Vorschläge</h2>${ruleChips(S.hh.rules || [], 'data-rule-suggest')}
  <h2>Eigene Abmachungen</h2>
  ${own.length ? `<div class="filters own-rules">${own.map((r) => `<button data-rule-remove="${esc(r)}" aria-pressed="true" aria-label="${esc(r)} entfernen">${esc(r)}<span aria-hidden="true">×</span></button>`).join('')}</div>` : ''}
  ${S.addRule ? `<form id="ruleForm" class="addrule"><input type="text" id="newRule" maxlength="120" enterkeyhint="done" autocomplete="off" aria-label="Neue Abmachung" placeholder="z. B. Pflanzen am Fensterbrett gießen">
    <div class="btnrow"><button type="submit" class="btn primary">Hinzufügen</button><button type="button" class="btn" data-action="rule-done">Fertig</button></div></form>`
    : `<button class="addrow" data-action="rule-add">${icon('plus', 18)}Abmachung</button>`}
  <span class="hint">Selbstverständliches für jeden Tag: jeden Tag neu abhakbar, wer zuerst erledigt, hakt für alle ab. Nie offen, zählt als extra. „Pflanzen gießen bei Hitze“ erscheint nur von Juni bis August.</span>`;
};

const viewBackup = () => `<p class="small" style="margin-top:18px">Sichert Haushalt, Aufgaben und Verlauf in eine Datei (z. B. in „Dateien“). Einspielen ersetzt Aufgaben und Haushalts-Einstellungen durch die aus der Datei, der Verlauf bleibt und wird ergänzt.</p>
  <div class="btnrow"><button class="btn" data-action="export">Daten exportieren</button><button class="btn" data-action="import">Daten importieren</button></div>
  ${S.backup ? `<p class="small">Sicherung bereit: ${backupCounts(S.backup.data)}</p>
  <div class="btnrow"><button class="btn primary" data-action="save-backup">Datei sichern</button></div>` : ''}
  <input type="file" id="importFile" accept=".json,application/json" hidden>`;

const viewStart = () => `<label class="field" style="margin-top:18px">Ab diesem Tag zählen die Termine<input type="date" data-start value="${esc(S.hh.setup)}"></label>
  <p class="small">Davor ist nichts „vergessen“. Wird beim Einrichten automatisch gesetzt. Ändern, wenn ihr erst später loslegen wollt (z. B. nach einem Urlaub oder Umzug) oder neu zu zählen beginnen wollt, ohne den Plan neu einzurichten. Auch der 2-Wochen-Rhythmus zählt ab hier.</p>`;

function renderWhoAmI() {
  app.innerHTML = `<header class="top">${LOGO}</header>
    <h2>Wer bist du?</h2>
    <p>Einmalig pro Gerät. Deine Aufgaben stehen danach zuerst.</p>
    <div class="tile">${S.hh.persons.map((p) => `<button class="mrow" data-me="${p.id}">${avatar(p, 'm')}<span class="l">${esc(p.name)}</span><span class="chev">${icon('chevron', 16)}</span></button>`).join('')}</div>`;
}

// ---------- Einrichtung ----------

// mode: our | suggest | empty; pick: Aufgaben der Bereiche-Auswahl (on = übernommen)
const PICK_START = { mode: null, answers: [], pick: [], pickKey: null, openAreas: [], ownArea: null };

// reset: „Plan neu einrichten“ im bestehenden Haushalt (Code, Verbindung und Verlauf bleiben)
function startSetup(reset = false) {
  S.setup = reset
    ? { step: 'persons', reset: true, persons: S.hh.persons.map((p) => ({ name: p.name, color: p.color, days: p.days?.length ? p.days : [5] })),
      shared: S.hh.sharedDays?.length ? S.hh.sharedDays : [5], start: S.today,
      rules: (S.hh.rules || []).map((r) => RULE_RENAMED[r] || r).filter((r) => RULE_SUGGESTIONS.includes(r)), tasks: [], planRules: [], ...PICK_START, error: '' }
    : { step: 'start', persons: [{ name: '', color: 'violett', days: [5] }, { name: '', color: 'gruen', days: [5] }],
      shared: [5], start: S.today, rules: [], tasks: [], planRules: [], ...PICK_START, error: '' };
  renderSetup();
}

const hours = (min) => (min / 60).toLocaleString('de-AT', { maximumFractionDigits: 1 });
const setupCtx = () => ({ ...DEFAULT_HOUSEHOLD, setup: S.setup.start, persons: [{ id: 'p1' }, { id: 'p2' }] });
// Stunden pro Woche für beide zusammen
const weekMinutes = (tasks) => Object.values(loadByPerson(tasks, setupCtx())).reduce((a, b) => a + b, 0) / 4.3;

// Bereiche-Auswahl
const pickedTasks = () => S.setup.pick.filter((t) => t.on);
const pickTotal = () => {
  const min = weekMinutes(pickedTasks());
  return `Pro Woche ${hours(min)} h · pro Person ${hours(min / 2)} h`;
};
const kindOptions = (cur) => KINDS.filter((k) => k !== 'custom').map((k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${KIND_LABEL[k]}</option>`).join('');
const pickRow = (t) => {
  const i = S.setup.pick.indexOf(t);
  const meta = [t.note, t.season && seasonLabel(t.season)].filter(Boolean).join(' · ');
  return `<div class="pick ${t.on ? 'on' : ''}">
    <label class="pick-main"><span class="check"><input type="checkbox" data-pick="${i}" ${t.on ? 'checked' : ''}><span class="box"></span></span>
      <span class="body"><span class="title">${esc(t.title)}</span>${meta ? `<span class="meta">${esc(meta)}</span>` : ''}</span></label>
    <div class="inline pick-ctrl"><select data-pick-kind="${i}" aria-label="Rhythmus">${kindOptions(kindOf(t))}</select>
      <input type="number" data-pick-min="${i}" min="0" max="999" inputmode="numeric" value="${t.min ?? ''}" aria-label="Dauer in Minuten"><span>Min</span></div>
  </div>`;
};
const ownBlock = (key) => (S.setup.ownArea === key
  ? `<form id="ownForm" class="pick-own" data-area="${key}">
      <input type="text" name="title" maxlength="120" placeholder="Name der Aufgabe" aria-label="Name der Aufgabe" autocomplete="off">
      <div class="inline pick-ctrl"><select name="kind" aria-label="Rhythmus">${kindOptions('weekly')}</select>
        <input type="number" name="min" min="0" max="999" inputmode="numeric" value="15" aria-label="Dauer in Minuten"><span>Min</span></div>
      <p class="ov" data-own-error></p>
      <div class="btnrow"><button type="button" class="btn" data-setup-own="">Abbrechen</button><button class="btn primary">Hinzufügen</button></div>
    </form>`
  : `<button class="addrow" data-setup-own="${key}">${icon('plus', 18)}Eigene Aufgabe</button>`);
const areaTiles = () => AREAS.map(([key, name]) => {
  const st = S.setup;
  const list = st.pick.filter((t) => t.area === key);
  const open = st.openAreas.includes(key);
  return `<section class="tile area ${open ? 'open' : ''}">
    <button class="mrow" data-setup-area="${key}" aria-expanded="${open}"><span class="l">${name}</span><span class="v">${list.filter((t) => t.on).length} von ${list.length}</span><span class="chev">${icon('chevron', 16)}</span></button>
    ${open ? `<div class="area-body">${list.map(pickRow).join('')}${ownBlock(key)}</div>` : ''}
  </section>`;
}).join('');


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
      <p>Der Putzplan für deinen Haushalt. Lege einen Haushalt an oder tritt mit einem Code bei.</p>
      <div class="btnrow"><button class="btn primary block" data-setup="new">Haushalt neu anlegen</button></div>
      <h2>Beitreten</h2>
      <label class="field">Haushalts-Code<input type="text" id="joinCode" class="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX"></label>
      <div class="btnrow"><button class="btn block" data-setup="join">Beitreten</button></div>${err}${local}`;
  } else if (st.step === 'persons') {
    body = `<h2>${st.reset ? 'Plan neu einrichten · ' : ''}Personen</h2>
      ${st.persons.map((p, i) => `<section class="tile setup-person">
        <div class="setup-head">${avatar({ ...p, name: p.name || `${i + 1}` }, 'l')}<strong>Person ${i + 1}</strong></div>
        <h2><label for="sname${i}">Name</label></h2>
        <input type="text" id="sname${i}" data-setup-name="${i}" value="${esc(p.name)}" maxlength="30">
        <h2>Farbe</h2>${colorGrid(p.color, (c) => st.persons.find((o, j) => j !== i && o.color === c), `data-setup-color="${i}"`)}
        <h2>${putztagWord(p.days, 'Putztag', 'Putztage')}</h2>${dayChips(p.days, `data-setup-day="${i}"`)}
      </section>`).join('')}
      <section class="tile setup-person"><h2 style="margin-top:0">${putztagWord(st.shared, 'Gemeinsamer Putztag', 'Gemeinsame Putztage')}</h2>${dayChips(st.shared, 'data-setup-shared')}
        <span class="hint">Ein oder mehrere Tage, später im Profil und unter „Mehr“ änderbar.</span></section>
      ${err}
      <div class="btnrow"><button class="btn" data-setup="${st.reset ? 'cancel' : 'start'}">${st.reset ? 'Abbrechen' : 'Zurück'}</button><button class="btn primary" data-setup="template">Weiter</button></div>`;
  } else if (st.step === 'template') {
    body = `<h2>Vorlage</h2>
      <button class="choice" data-setup="plan-our"><strong>Daniel und Sabrina</strong>
        <span>Unser Plan: ${OUR_TASKS.length} Aufgaben, ca. ${hours(weekMinutes(OUR_TASKS))} h pro Woche, dazu ${OUR_RULES.length} Abmachungen</span></button>
      <button class="choice" data-setup="plan-suggest"><strong>Vorschlag 2-Personen-Haushalt</strong>
        <span>Ein paar Fragen, dann die passenden Aufgaben vorausgewählt und fair aufgeteilt</span></button>
      <button class="choice" data-setup="plan-empty"><strong>Leer starten</strong>
        <span>Aufgaben nach Bereichen selbst auswählen</span></button>${err}
      ${st.reset ? '<p class="small">Die bisherigen Aufgaben werden ersetzt. Code, Verbindung und Verlauf bleiben.</p>' : ''}
      <div class="btnrow"><button class="btn" data-setup="persons">Zurück</button></div>`;
  } else if (st.step === 'questions') {
    body = `<h2>Was gibt es bei euch?</h2>
      <p class="small">Passende Aufgaben wählen wir vor. Danach kannst du alles ändern.</p>
      <div class="filters">${QUESTIONS.map(([id, label]) => `<button data-setup-q="${id}" aria-pressed="${st.answers.includes(id)}">${label}</button>`).join('')}</div>
      <div class="btnrow"><button class="btn" data-setup="template">Zurück</button><button class="btn primary" data-setup="areas-suggest">Weiter</button></div>`;
  } else if (st.step === 'areas') {
    body = `<h2>Aufgaben</h2>
      <p class="small">Bereich antippen, Aufgabe antippen = übernehmen. Rhythmus und Dauer kannst du gleich hier ändern.</p>
      ${areaTiles()}${err}
      <div class="btnrow"><button class="btn" data-setup="${st.mode === 'suggest' ? 'plan-suggest' : 'template'}">Zurück</button><button class="btn primary" data-setup="areas-next">Weiter</button></div>
      <div class="setup-total" id="pickTotal">${pickTotal()}</div>`;
  } else if (st.step === 'split') {
    const load = loadByPerson(st.tasks, setupCtx());
    const names = st.persons.map((p) => esc(p.name.trim()));
    const list = (pkg) => st.tasks.map((t, i) => [t, i]).filter(([t]) => t.assign === pkg).map(([t, i]) => `
      <button class="rowbtn" data-split="${i}"><span>${esc(t.title)}<br><span class="meta">${t.min} Min · ${intervalLabel(t)} · ${hours(monthlyMinutes(t))} h/Monat</span></span><span class="meta">tauschen</span></button>`).join('');
    body = `<h2>Aufteilung</h2>
      <div class="banner now">${names[0]} <strong>${hours(load.p1)} h</strong> · ${names[1]} <strong>${hours(load.p2)} h</strong> pro Monat</div>
      <p class="small">Automatisch fair verteilt: insgesamt möglichst gleich viel Zeit (Dauer × Häufigkeit), das Häufige zuerst. Antippen gibt eine Aufgabe der anderen Person – die Bilanz rechnet mit. Gemeinsames zählt je zur Hälfte. Zeiten kannst du später bei jeder Aufgabe ändern.</p>
      <p class="small">Die beiden Listen tauschen jeden Monat (zum ersten Mal am ${fmtDate(nextSwap({ rotateFrom: rotationBase(st.start) }, st.start))}). Halbjährliches und Jährliches wechselt bei jedem Durchgang. Unter „Mehr“ kannst du das ausschalten.</p>
      <h2><i class="sw" style="--pc:var(--c-${st.persons[0].color})"></i>${names[0]}</h2><div class="rows">${list('A')}</div>
      <h2><i class="sw" style="--pc:var(--c-${st.persons[1].color})"></i>${names[1]}</h2><div class="rows">${list('B')}</div>
      <p class="small">Dazu ${st.tasks.filter((t) => t.assign !== 'A' && t.assign !== 'B').length} gemeinsame, abwechselnde oder persönliche Aufgaben und ${setupRules(true).length} Abmachungen.</p>
      ${err}
      <div class="btnrow"><button class="btn" data-setup="${{ our: 'template', suggest: 'areas', empty: 'rules' }[st.mode]}">Zurück</button><button class="btn primary" data-setup="create-template">${finish}</button></div>`;
  } else if (st.step === 'rules') {
    body = `<h2>Abmachungen</h2>
      <p class="small">Selbstverständliches für jeden Tag – für beide abhakbar, nie „offen“. Später in den Optionen änderbar.</p>
      ${ruleChips(st.rules, 'data-setup-rule')}${err}
      <div class="btnrow"><button class="btn" data-setup="areas">Zurück</button>${pickedTasks().length
        ? '<button class="btn primary" data-setup="to-split">Weiter</button>'
        : `<button class="btn primary" data-setup="create-empty">${finish}</button>`}</div>`;
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
  return withTemplate ? spreadPositions(S.setup.tasks).map(({ when, ...t }, i) => ({ ...t, id: newId(), created: S.setup.start, order: i })) : [];
}
const setupPersons = () => S.setup.persons.map((p, i) => ({ id: `p${i + 1}`, name: p.name.trim(), color: p.color, days: p.days }));
const setupRules = (withTemplate) => RULE_SUGGESTIONS.filter((r) => S.setup.rules.includes(r) || (withTemplate && S.setup.planRules.includes(r)));

async function createHousehold(withTemplate) {
  const st = S.setup;
  const code = newCode();
  const doc = {
    ...DEFAULT_HOUSEHOLD,
    setup: st.start,
    rotateFrom: rotationBase(st.start),
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
  ls.set('me', 'p1'); // wer anlegt, ist Person 1
  S.me = 'p1';
  keepIdentity();
  st.step = 'created';
  renderSetup();
}

// Plan neu einrichten: Aufgaben ersetzen, neuer Start; Code, Personen-IDs, eigene Abmachungen und Verlauf bleiben
function resetPlan(withTemplate) {
  const st = S.setup;
  const persons = S.hh.persons.map((p, i) => ({ ...p, ...setupPersons()[i], id: p.id }));
  for (const t of S.tasks) S.store.deleteTask(S.code, t.id);
  for (const t of setupTasks(withTemplate)) S.store.saveTask(S.code, t);
  updateHH({ persons, sharedDays: st.shared, rules: [...setupRules(withTemplate), ...ownRules().filter((r) => !RULE_RENAMED[r])], setup: st.start, rotateFrom: rotationBase(st.start), swapped: false });
  S.setup = null;
  S.view = 'heute';
  S.stack = [];
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
  keepIdentity();
  // im Browser (nicht vom Home-Bildschirm) beigetreten: Hinweis, die App noch abzulegen
  if (fromLink && !standalone()) { st.step = 'joined'; return renderSetup(); }
  S.setup = null;
  connect(code);
}
const standalone = () => navigator.standalone || matchMedia('(display-mode: standalone)').matches;

// ---------- Aktionen ----------

// Darstellung: Auto folgt dem Handy (dunkel → Dunkel, hell → Farbe), sonst die eigene Wahl
const systemLight = matchMedia('(prefers-color-scheme: light)');
function theme() { return ls.get('theme') || 'auto'; }
function setTheme(t) {
  ls.set('theme', t === 'auto' ? null : t);
  document.documentElement.dataset.theme = t === 'auto' ? (systemLight.matches ? 'zart' : 'dark') : t;
}
systemLight.addEventListener('change', () => { if (theme() === 'auto') { setTheme('auto'); render(); } });

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
  } else if (!reopen(id, task.title)) input.checked = true;
}

// Eigene Erledigung zurücknehmen (Aktuell und Plan): mit Sicherheitsabfrage, Teilschritte gleich mit
function reopen(id, title) {
  if (!confirm(`„${title}“ wieder öffnen?`)) return false;
  const prev = S.comps.get(id) || S.dayComps.find((c) => c.id === id);
  S.store.removeCompletion(S.code, id);
  const task = S.tasks.find((t) => t.id === prev?.taskId);
  (task?.steps || []).forEach((_, i) => S.store.removeCompletion(S.code, `${id}__s${i}`));
  snack('Wieder offen.');
  return true;
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
  } else if (!reopen(id, title)) input.checked = true;
}

// Profilfoto: mittig zuschneiden und klein rechnen (bleibt im Gratis-Rahmen der Datenbank)
async function setPhoto(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const size = 160, side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
    canvas.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    patchMe({ avatar: 'photo', photo: canvas.toDataURL('image/jpeg', 0.75) });
  } catch (e) {
    console.error(e);
    snack('Foto konnte nicht geladen werden.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
const patchMe = (patch) => updateHH({ persons: S.hh.persons.map((p) => (p.id === S.me ? { ...p, ...patch } : p)) });

// ---------- Backup ----------

const backupCounts = (d) => `Aufgaben: ${d.tasks.length}, Erledigungen: ${d.completions.length}`;

// Erst laden, dann eigener Knopf zum Sichern: das iPhone erlaubt Teilen nur direkt nach einem Tippen
async function exportData() {
  try {
    const data = { app: 'fairplan', version: 1, exportedAt: new Date().toISOString(), ...(await S.store.exportAll(S.code)) };
    S.backup = { data, name: `fairplan-backup-${S.today}.json` };
    render();
  } catch (e) {
    console.error(e);
    snack('Export fehlgeschlagen (offline?).');
  }
}

async function saveBackup() {
  const { data, name } = S.backup;
  try {
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
    } else {
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    S.backup = null;
    render();
    snack('Sicherung erstellt.');
  } catch (e) {
    if (e?.name !== 'AbortError') { console.error(e); snack('Sichern fehlgeschlagen.'); }
  }
}

async function importFile(input) {
  const file = input.files[0];
  input.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch { data = null; }
  const hasIds = (list) => Array.isArray(list) && list.every((x) => x?.id && typeof x.id === 'string');
  if (data?.app !== 'fairplan' || !Array.isArray(data.household?.persons) || !hasIds(data.tasks) || !hasIds(data.completions)) {
    return snack('Das ist keine Fairplan-Sicherung.');
  }
  const when = data.exportedAt ? fmtLong(data.exportedAt.slice(0, 10)) : '?';
  if (!confirm(`Sicherung vom ${when} einspielen (${backupCounts(data)})? Aufgaben und Haushalts-Einstellungen werden durch die aus der Datei ersetzt.`)) return;
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
  const el = e.target.closest('button, [data-action]');
  if (!el || el.disabled) return;
  const d = el.dataset;
  if (d.view) { S.stack = []; S.view = d.view; window.scrollTo(0, 0); return render(); }
  if (d.go) { S.stack.push(S.view); S.view = d.go; history.pushState(null, ''); window.scrollTo(0, 0); return render(); }
  if (el.matches('[data-back]')) { S.addRule = false; return history.back(); }
  if (d.filter) { S.filter = d.filter; return render(); }
  if (d.kindFilter) { S.kindFilter = d.kindFilter; return render(); }
  if (d.awayClear) return updateHH({ away: { ...(S.hh.away || {}), [d.awayClear]: {} } });
  if (d.planMode) { S.planMode = d.planMode; S.planDate = S.calDay; return render(); }
  if (d.planNav) {
    const a = planAnchor(), step = +d.planNav;
    if (S.planMode === 'week') S.planDate = fromDay(toDay(a) + 7 * step);
    else {
      const [y, m] = a.split('-').map(Number);
      S.planDate = `${new Date(y, m - 1 + step, 1).getFullYear()}-${String(new Date(y, m - 1 + step, 1).getMonth() + 1).padStart(2, '0')}-01`;
    }
    S.calDay = S.today >= planRange()[0] && S.today <= planRange()[1] ? S.today : planRange()[0];
    return render();
  }
  if (d.pickDay) { S.calDay = d.pickDay; return render(); }
  if (d.statMode) { S.statMode = d.statMode; return render(); }
  if (d.reopen) {
    const c = S.dayComps.find((x) => x.id === d.reopen);
    return c ? void reopen(d.reopen, c.title) : undefined;
  }
  if (d.avatar) return patchMe({ avatar: d.avatar });
  if (d.me) { S.me = d.me; ls.set('me', d.me); keepIdentity(); return render(); }
  if (d.themeSet) { setTheme(d.themeSet); return render(); }
  if (d.edit !== undefined && el.matches('[data-edit]')) return openEditor(d.edit);
  if (d.personColor) {
    const persons = S.hh.persons.map((p, i) => (i === +d.personColor ? { ...p, color: d.color } : p));
    return updateHH({ persons });
  }
  if (d.setupColor) { S.setup.persons[+d.setupColor].color = d.color; return renderSetup(); }
  if (d.setupRule) { S.setup.rules = toggled(S.setup.rules, d.setupRule); return renderSetup(); }
  if (d.setupQ) { S.setup.answers = toggled(S.setup.answers, d.setupQ); return renderSetup(); }
  if (d.setupArea) { S.setup.openAreas = toggled(S.setup.openAreas, d.setupArea); return renderSetup(); }
  if (d.setupOwn !== undefined) {
    S.setup.ownArea = d.setupOwn || null;
    renderSetup();
    return $('#ownForm input[name="title"]')?.focus();
  }
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
    const picked = toggled(S.hh.rules || [], d.ruleSuggest);
    return updateHH({ rules: [...RULE_SUGGESTIONS.filter((r) => picked.includes(r)), ...ownRules()] });
  }
  if (d.ruleRemove) {
    const before = S.hh.rules || [];
    updateHH({ rules: before.filter((r) => r !== d.ruleRemove) });
    return snack('Abmachung entfernt.', () => updateHH({ rules: before }));
  }
  if (d.setup) return setupAction(d.setup);
  switch (d.action) {
    case 'swap-seen': ls.set('swap-seen', S.today.slice(0, 7)); return render();
    case 'rule-add': S.addRule = true; render(); $('#newRule')?.focus(); return;
    case 'rule-done': addOwnRule(false); S.addRule = false; document.activeElement?.blur(); return render();
    case 'copy': return copyCode();
    case 'copy-link':
      navigator.clipboard?.writeText(inviteLink()).then(() => snack('Link kopiert.'), () => snack(inviteLink()));
      return;
    case 'share':
      navigator.share({ title: 'Fairplan', text: 'Tritt unserem Putzplan bei:', url: inviteLink() }).catch(() => {});
      return;
    case 'reset-plan': window.scrollTo(0, 0); return startSetup(true);
    case 'export': return exportData();
    case 'save-backup': return saveBackup();
    case 'import': $('#importFile').click(); return;
    case 'photo': $('#photoFile').click(); return;
    case 'del-photo': {
      if (!confirm('Foto löschen?')) return;
      const persons = S.hh.persons.map(({ photo, ...p }) => (p.id === S.me ? { ...p, avatar: p.avatar === 'photo' ? 'letter' : p.avatar } : { ...p, ...(photo ? { photo } : {}) }));
      return updateHH({ persons });
    }
    case 'badge':
      Notification.requestPermission().then(() => { lastBadge = -1; render(); }).catch(() => {});
      return;
    case 'leave':
      if (!confirm('Haushalt auf diesem Gerät abmelden?')) return;
      ls.set('code', null); ls.set('me', null); ls.set('accent', null);
      forgetIdentity().finally(() => location.replace(location.pathname)); // ohne ?join=, sonst wäre man gleich wieder drin
  }
});

function setupAction(a) {
  const st = S.setup;
  st.error = '';
  if (a === 'new' || a === 'persons') st.step = 'persons';
  else if (a === 'start') st.step = 'start';
  else if (a === 'rules' || a === 'areas') st.step = a;
  else if (a === 'plan-our') {
    Object.assign(st, { mode: 'our', tasks: autoSplit(OUR_TASKS), planRules: OUR_RULES, step: 'split' });
  } else if (a === 'plan-suggest') {
    if (st.mode !== 'suggest') Object.assign(st, { mode: 'suggest', pick: [], pickKey: null, openAreas: [] });
    st.step = 'questions';
  } else if (a === 'areas-suggest') {
    const key = [...st.answers].sort().join();
    if (st.pickKey !== key) Object.assign(st, { pick: suggestTasks(st.answers), pickKey: key, openAreas: [], ownArea: null });
    st.planRules = suggestRules(st.answers);
    st.step = 'areas';
  } else if (a === 'plan-empty') {
    if (st.mode !== 'empty') {
      Object.assign(st, { mode: 'empty', pick: suggestTasks([]).map((t) => ({ ...t, on: false })), openAreas: [], ownArea: null, planRules: [] });
    }
    st.step = 'areas';
  } else if (a === 'areas-next' || a === 'to-split') {
    if (a === 'areas-next' && (st.mode === 'empty' || !pickedTasks().length)) {
      st.rules = RULE_SUGGESTIONS.filter((r) => st.rules.includes(r) || st.planRules.includes(r));
      st.step = 'rules';
    } else {
      st.tasks = autoSplit(pickedTasks().map(({ on, soft, ...t }) => t));
      st.step = 'split';
    }
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
  if (st.error) $('#app .ov')?.scrollIntoView({ block: 'center' });
}

// Eigene Abmachung hinzufügen; danach bleibt die Eingabe offen für die nächste
function addOwnRule(again = true) {
  const input = $('#newRule');
  const text = input?.value.trim();
  if (text) {
    const rules = S.hh.rules || [];
    if (rules.includes(text)) snack('Diese Abmachung gibt es schon.');
    else if (rules.length >= 50) snack('Mehr als 50 Abmachungen gehen nicht.');
    else {
      const picked = [...rules, text];
      const next = [...RULE_SUGGESTIONS.filter((r) => picked.includes(r)), ...picked.filter((r) => !RULE_SUGGESTIONS.includes(r))];
      S.hh = { ...S.hh, rules: next }; // gleich anzeigen, auch solange das Feld den Fokus hat
      updateHH({ rules: next });
    }
  }
  if (!again) return;
  input?.blur();
  render();
  $('#newRule')?.focus();
}
// Bereiche-Auswahl: Rhythmus ändern; Gemeinsames folgt dem neuen Rhythmus, „pro Person“ bleibt
function setPickKind(t, kind) {
  Object.assign(t, PRESETS[kind]);
  if (t.assign !== 'each') t.assign = defaultAssign(t);
  if (kind === 'asneeded' && t.perMonth == null) t.perMonth = 1;
}
const clampMin = (v) => Math.max(0, Math.min(999, parseInt(v, 10) || 0));

app.addEventListener('submit', (e) => {
  if (e.target.id === 'ownForm') {
    e.preventDefault();
    const f = e.target.elements;
    const title = f.title.value.trim();
    if (!title) { $('[data-own-error]', e.target).textContent = 'Bitte einen Namen eingeben.'; return f.title.focus(); }
    const t = { title, area: e.target.dataset.area, min: clampMin(f.min.value), note: '', season: null, on: true };
    setPickKind(t, f.kind.value);
    S.setup.pick.push(t);
    S.setup.ownArea = null;
    return renderSetup();
  }
  if (e.target.id !== 'ruleForm') return;
  e.preventDefault();
  addOwnRule();
});

app.addEventListener('change', (e) => {
  const el = e.target;
  const d = el.dataset;
  if (d.pick !== undefined) { S.setup.pick[+d.pick].on = el.checked; return renderSetup(); }
  if (d.pickKind !== undefined) { setPickKind(S.setup.pick[+d.pickKind], el.value); $('#pickTotal').textContent = pickTotal(); return; }
  if (d.action === 'toggle') return toggle(el);
  if (d.action === 'toggle-rule') return toggleRule(el);
  if (d.action === 'toggle-step') return toggleStep(el);
  if (d.switch === 'rotate') return updateHH({ rotateFrom: el.checked ? rotationBase(S.today) : null });
  if (d.switch === 'vibrate') { ls.set('vibrate', el.checked ? null : '0'); if (el.checked) haptic(); return; }
  if (d.switch === 'badge') {
    ls.set('badge', el.checked ? null : '0');
    lastBadge = -1;
    if (el.checked && Notification?.permission === 'default') {
      Notification.requestPermission().catch(() => {}).finally(() => { lastBadge = -1; render(); });
      return;
    }
    return render();
  }
  if (el.id === 'importFile') return importFile(el);
  if (el.id === 'photoFile') return setPhoto(el);
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
});

// Wischen in beide Richtungen = abhaken bzw. wieder öffnen (Zeilen mit data-swipe; senkrechtes Scrollen bleibt frei)
let swipe = null, swallowClick = false;
app.addEventListener('pointerdown', (e) => {
  const row = e.target.closest('.item[data-swipe]');
  swipe = row && e.isPrimary ? { row, bg: row.previousElementSibling, x: e.clientX, y: e.clientY, dx: 0, active: false } : null;
});
app.addEventListener('pointermove', (e) => {
  if (!swipe) return;
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
  if (!swipe.active) {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
    if (Math.abs(dx) < 12) return;
    swipe.active = true;
    swipe.row.classList.add('dragging');
  }
  swipe.dx = dx;
  swipe.row.style.transform = `translateX(${dx}px)`;
  swipe.bg.classList.toggle('left', dx < 0);
  swipe.bg.style.opacity = Math.min(1, Math.abs(dx) / 60);
});
function endSwipe() {
  if (!swipe) return;
  const { row, bg, dx, active } = swipe;
  swipe = null;
  if (!active) return;
  swallowClick = true;
  setTimeout(() => { swallowClick = false; }, 300);
  row.classList.remove('dragging');
  row.style.transform = '';
  bg.style.opacity = '';
  if (Math.abs(dx) <= Math.min(100, row.offsetWidth * 0.3)) return;
  const input = row.querySelector('input[data-action="toggle"], input[data-action="toggle-rule"]');
  if (!input || input.disabled) return;
  row.classList.toggle('toleft', dx < 0);
  input.checked = !input.checked;
  (input.dataset.action === 'toggle' ? toggle : toggleRule)(input);
}
app.addEventListener('pointerup', endSwipe);
app.addEventListener('pointercancel', endSwipe);
// nach einem Wischer keinen Klick auf die Checkbox auslösen
app.addEventListener('click', (e) => { if (swallowClick) { e.preventDefault(); e.stopPropagation(); swallowClick = false; } }, true);

// Auf-/Zuklappen merken (toggle blubbert nicht, daher capture)
app.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d.dataset?.fold) S.open[d.dataset.fold] = d.open;
  if (d.dataset?.fold === 'rules') ls.set('open-rules', d.open ? '1' : null);
}, true);

app.addEventListener('input', (e) => {
  const d = e.target.dataset;
  if (d.pickMin !== undefined) { S.setup.pick[+d.pickMin].min = clampMin(e.target.value); $('#pickTotal').textContent = pickTotal(); }
  if (d.setupName !== undefined) {
    const p = S.setup.persons[+d.setupName];
    p.name = e.target.value;
    const av = e.target.closest('.setup-person')?.querySelector('.av');
    if (av) av.textContent = p.name.trim().charAt(0).toUpperCase() || +d.setupName + 1;
  }
});

// ---------- Aufgabe bearbeiten ----------

const sheet = $('#sheet');

// Zuteilung im Editor: bei monatlichem Tausch Pakete und „Fix bei“, sonst die Personen
function assignOptions(t, rotate, opt) {
  const cur = rotate && t.fixed && (t.assign === 'A' || t.assign === 'B') ? `fix-${t.assign}` : t.assign;
  const name = (pkg) => esc(S.hh.persons[pkg === 'A' ? 0 : 1].name);
  const people = rotate
    ? [['A', ''], ['B', ''], ['fix-A', `Fix bei ${name('A')}`], ['fix-B', `Fix bei ${name('B')}`]]
    : [['A', name('A')], ['B', name('B')]];
  return [
    ...people,
    ['shared', 'Gemeinsam (jede/r darf abhaken)'],
    ['each', 'Pro Person (jede/r für sich)'],
    ...(t.assign === 'alternate' ? [['alternate', 'Abwechselnd (jedes Mal die andere Person)']] : []),
  ].map(([v, l]) => opt(v, l, cur)).join('');
}

function openEditor(id) {
  const t = S.tasks.find((x) => x.id === id) || { n: 1, unit: 'week', assign: 'A', title: '', note: '', season: null };
  const isNew = !t.id;
  const kind = kindOf(t);
  const opt = (v, l, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`;
  const months = (cur) => MONTHS.map((m, i) => opt(i + 1, m, cur)).join('');
  const rotate = !!S.hh.rotateFrom;
  sheet.innerHTML = `<form id="taskForm" novalidate>
    <header class="top"><h1>${isNew ? 'Neue Aufgabe' : 'Aufgabe bearbeiten'}</h1></header>
    <label class="field">Titel<input type="text" name="title" value="${esc(t.title)}" maxlength="120"></label>
    <label class="field">Intervall<select name="kind">${KINDS.filter((k) => k !== 'custom' || kind === 'custom').map((k) => opt(k, k === 'custom' ? `Eigenes: alle ${t.n} ${UNIT_LABEL[t.unit]?.[1] ?? ''}` : KIND_LABEL[k], kind)).join('')}</select></label>
    <div class="inline" data-custom><span>alle</span><input type="number" name="n" min="1" max="999" value="${t.n}" inputmode="numeric">
      <select name="unit">${Object.entries(UNIT_LABEL).map(([u, l]) => opt(u, l[1], t.unit)).join('')}</select></div>
    <label class="field" data-permonth>Ca. wie oft pro Monat?<input type="number" name="perMonth" min="0" max="99" step="0.5" inputmode="decimal" value="${t.perMonth ?? ''}"></label>
    <label class="field">Zuteilung<select name="assign">${assignOptions(t, rotate, opt)}</select></label>
    <label class="field">Dauer in Minuten (geschätzt, für die faire Aufteilung)<input type="number" name="min" min="0" max="999" inputmode="numeric" value="${t.min ?? ''}"></label>
    <p class="small" data-next></p>
    <details class="more" ${t.note || t.season || t.steps?.length || Number.isInteger(t.day) ? 'open' : ''}>
      <summary>Mehr: Tag, Termin, Saison, Hinweis, Teilschritte</summary>
      <label class="field" data-day>Tag<select name="day">${opt('', 'An den Putztagen der zuständigen Person', t.day ?? '')}${WEEKDAYS_LONG.map((w, i) => opt(i, `Fest am ${w}`, t.day ?? '')).join('')}</select></label>
      <label class="field" data-pos>Termin<select name="pos"></select></label>
      <label class="cb"><input type="checkbox" name="hasSeason" ${t.season ? 'checked' : ''}> Nur in einer Saison</label>
      <div class="inline" data-season><select name="from">${months(t.season?.from ?? 3)}</select><span>bis</span><select name="to">${months(t.season?.to ?? 10)}</select></div>
      <div class="inline" data-season2><span>und</span><select name="from2" aria-label="Zweiter Zeitraum von">${opt('', '–', t.season?.from2 ?? '')}${months(t.season?.from2 ?? '')}</select><span>bis</span><select name="to2" aria-label="Zweiter Zeitraum bis">${months(t.season?.to2 ?? 11)}</select></div>
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
  history.pushState(null, '');
  editorEntry = true;
  const form = $('#taskForm');
  const f = form.elements;
  const seasonValue = () => {
    if (!f.hasSeason.checked) return null;
    const s = { from: +f.from.value, to: +f.to.value };
    return f.from2.value === '' ? s : { ...s, from2: +f.from2.value, to2: +f.to2.value };
  };
  // Auswahl im Formular: „fix-A“ heißt Paket A ohne Tausch
  const assignValue = () => {
    const v = f.assign.value;
    return { assign: v.replace('fix-', ''), fixed: rotate ? v.startsWith('fix-') : !!t.fixed };
  };
  // Pakete nennen, wer jetzt zuständig ist (hängt vom Intervall ab)
  const paintPackages = () => {
    if (!rotate) return;
    for (const o of f.assign.options) {
      if (o.value !== 'A' && o.value !== 'B') continue;
      const owner = ownerNow(draft({ assign: o.value, fixed: false }), S.hh, S.today);
      o.textContent = `Paket ${o.value} (jetzt ${S.hh.persons.find((p) => p.id === owner)?.name ?? ''})`;
    }
  };
  // Entwurf aus dem Formular, für die Vorschau der nächsten Termine
  const draft = (over = {}) => {
    const k = f.kind.value;
    const iv = k === 'custom' ? { n: Math.max(1, Math.min(999, parseInt(f.n.value, 10) || 1)), unit: f.unit.value } : PRESETS[k];
    return {
      id: 'x', ...iv, ...assignValue(), season: seasonValue(),
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
    paintPackages();
    $('[data-custom]', form).hidden = k !== 'custom';
    $('[data-permonth]', form).hidden = k !== 'asneeded';
    $('[data-season]', form).hidden = !f.hasSeason.checked;
    $('[data-season2]', form).hidden = !f.hasSeason.checked;
    $('[data-hint]', form).textContent = k === 'asneeded'
      ? 'Bei Bedarf: kein fixer Rhythmus, nie „nicht geschafft“. Einfach abhaken, wenn erledigt – zählt trotzdem im Verlauf und Kalender.'
      : k === 'halfyear' ? 'Halbjährlich = Jänner–Juni und Juli–Dezember.' : '';
  };
  sync();
  f.kind.addEventListener('change', sync);
  f.hasSeason.addEventListener('change', sync);
  for (const el of [f.day, f.pos, f.n, f.unit, f.from, f.to, f.from2, f.to2, f.assign]) el.addEventListener('change', sync);
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
      area: t.area ?? null,
      ...iv,
      ...assignValue(),
      season: seasonValue(),
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
  if (editorEntry) { editorEntry = false; skipPop = true; history.back(); }
}
// Zurück (Android-Taste, Browser, Pfeil oben): erst Editor schließen, dann eine Unterseite zurück
let editorEntry = false, skipPop = false;
window.addEventListener('popstate', () => {
  if (skipPop) { skipPop = false; return; }
  if (!sheet.hidden) { editorEntry = false; closeEditor(); return; }
  if (S.setup || !S.stack.length) return;
  document.activeElement?.blur(); // sonst bleibt die Seite stehen, solange ein Feld den Fokus hat
  S.view = S.stack.pop();
  window.scrollTo(0, 0);
  render();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!sheet.hidden) closeEditor();
});
