// Fälligkeits- und Rotationslogik. Reine Funktionen, keine Abhängigkeiten.
// Datumswerte sind Tagesnummern (Tage seit 1970-01-01, UTC) – sicher gegen Sommerzeit.

const MS_DAY = 86400000;

export const dayOf = (y, m, d) => Date.UTC(y, m - 1, d) / MS_DAY; // überlaufende Monate/Tage erlaubt
export const toDay = (s) => { const [y, m, d] = s.split('-').map(Number); return dayOf(y, m, d); };
export const ymd = (n) => { const t = new Date(n * MS_DAY); return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()]; };
const pad = (x) => String(x).padStart(2, '0');
export const fromDay = (n) => { const [y, m, d] = ymd(n); return `${y}-${pad(m)}-${pad(d)}`; };
export const localToday = (now = new Date()) => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const mod = (a, b) => ((a % b) + b) % b;
const weekday = (n) => mod(n - 4, 7); // Mo=0 … So=6 (Tag 4 = Mo, 5.1.1970)
const monday = (n) => n - weekday(n);
const daysInMonth = (y, m) => dayOf(y, m + 1, 1) - dayOf(y, m, 1);
const monthIndex = (n) => { const [y, m] = ymd(n); return y * 12 + (m - 1); };

export function isoWeek(n) {
  const thu = monday(n) + 3;
  const [y] = ymd(thu);
  return { year: y, week: Math.floor((thu - dayOf(y, 1, 1)) / 7) + 1 };
}

// ---------- Intervalle ----------

export const KINDS = ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'halfyear', 'yearly', 'custom', 'asneeded'];

export const PRESETS = {
  daily: { n: 1, unit: 'day' },
  weekly: { n: 1, unit: 'week' },
  biweekly: { n: 2, unit: 'week' },
  monthly: { n: 1, unit: 'month' },
  quarterly: { n: 3, unit: 'month' },
  halfyear: { n: 6, unit: 'month' },
  yearly: { n: 12, unit: 'month' },
  asneeded: { n: 0, unit: 'need' }, // bei Bedarf: kein Rhythmus, nie überfällig
};

export function kindOf(task) {
  for (const [k, p] of Object.entries(PRESETS)) if (p.n === task.n && p.unit === task.unit) return k;
  return 'custom';
}

// Liefert für eine Aufgabe: indexAt(tag) → Periodenindex, byIndex(i) → {key, index, start, end}.
// Perioden sind Kalenderwochen bzw. -monate (Quartal, Halbjahr, Jahr); alle 2 Wochen ab der Startwoche.
function periodScheme(task, setupDay) {
  const kind = kindOf(task);
  const tag = kind === 'custom' ? `${task.n}${task.unit[0]}` : kind;
  const mk = (index, start, end) => ({ key: `${tag}:${fromDay(start)}`, index, start, end });

  switch (kind) {
    case 'daily':
      return { indexAt: (d) => d, byIndex: (i) => mk(i, i, i) };
    case 'weekly':
      return { indexAt: (d) => (monday(d) - 4) / 7, byIndex: (i) => mk(i, i * 7 + 4, i * 7 + 10) };
    case 'biweekly': {
      const base = monday(setupDay);
      return {
        indexAt: (d) => Math.floor((d - base) / 14),
        byIndex: (i) => mk(i, base + 14 * i, base + 14 * i + 13),
      };
    }
    case 'monthly':
    case 'quarterly':
    case 'halfyear':
    case 'yearly': {
      const len = PRESETS[kind].n;
      return {
        indexAt: (d) => Math.floor(monthIndex(d) / len),
        byIndex: (i) => {
          const mi = i * len;
          const y = Math.floor(mi / 12), m = mod(mi, 12) + 1;
          return mk(i, dayOf(y, m, 1), dayOf(y, m + len, 1) - 1);
        },
      };
    }
    default: { // freie Intervalle, gezählt ab Einrichtung
      if (task.unit === 'month') {
        const base = monthIndex(setupDay);
        return {
          indexAt: (d) => Math.floor((monthIndex(d) - base) / task.n),
          byIndex: (i) => {
            const mi = base + i * task.n;
            const y = Math.floor(mi / 12), m = mod(mi, 12) + 1;
            return mk(i, dayOf(y, m, 1), dayOf(y, m + task.n, 1) - 1);
          },
        };
      }
      const len = task.n * (task.unit === 'week' ? 7 : 1);
      return {
        indexAt: (d) => Math.floor((d - setupDay) / len),
        byIndex: (i) => mk(i, setupDay + i * len, setupDay + (i + 1) * len - 1),
      };
    }
  }
}

// ---------- Saison ----------

export function inSeason(season, month) {
  if (!season) return true;
  const { from, to } = season;
  return from <= to ? month >= from && month <= to : month >= from || month <= to;
}

// ---------- Putztage & Fälligkeit ----------

// Putztage (Wochentage Mo=0 … So=6): fester Tag der Aufgabe, sonst die der zuständigen Person,
// bei Gemeinsamem die gemeinsamen. Standard Samstag.
export function daysFor(task, owner, ctx) {
  if (Number.isInteger(task.day)) return [task.day];
  const days = owner == null ? ctx.sharedDays : ctx.persons.find((p) => p.id === owner)?.days;
  return days?.length ? [...days].sort((a, b) => a - b) : [5];
}

// Wochen pro Periode – Spannweite für die Position (task.pos) einer Aufgabe
export function weeksPerPeriod(task) {
  const k = kindOf(task);
  if (k === 'weekly') return 1;
  if (task.unit === 'week') return task.n;
  if (task.unit === 'month') return task.n === 1 ? 5 : Math.round(task.n * 4.35);
  return 1;
}

// Spielraum nach dem Termin, bevor eine Aufgabe als vergessen gilt (Tage)
export function slackOf(task) {
  const len = task.n * (task.unit === 'month' ? 30 : task.unit === 'week' ? 7 : 1);
  if (len <= 1) return 0;
  if (len <= 7) return Math.min(2, len - 1);
  if (len <= 14) return 3;
  if (len <= 31) return 5;
  return 14;
}

// Termin einer Periode: der Putztag an Position task.pos. Wöchentlich wählt pos den Putztag in der Woche,
// sonst die Woche in der Periode (jeweils erster Putztag dieser Woche). Nur Tage in der Saison.
// Tägliches und Tagesintervalle: Periodenbeginn. null = in dieser Periode kein passender Tag.
export function dueDay(task, period, ctx, owner) {
  const ok = (d) => inSeason(task.season, ymd(d)[1]);
  if (task.unit === 'day') return ok(period.start) ? period.start : null;
  const days = new Set(daysFor(task, owner, ctx));
  const cands = [];
  for (let d = period.start; d <= period.end; d++) if (days.has(weekday(d)) && ok(d)) cands.push(d);
  if (!cands.length) return null;
  const pos = Number(task.pos) || 0;
  if (kindOf(task) === 'weekly') return cands[mod(pos, cands.length)];
  const weeks = [...new Set(cands.map(monday))];
  const w = weeks[mod(pos, weeks.length)];
  return cands.find((d) => monday(d) === w);
}

// Vorlage: Termine verteilen, damit nicht alles auf einen Tag fällt.
// Je Intervall und Zuteilung bekommen die Aufgaben der Reihe nach gleichmäßig verteilte Positionen.
export function spreadPositions(tasks) {
  const groups = new Map();
  tasks.forEach((t, i) => {
    const g = `${t.n}${t.unit}:${t.assign}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(i);
  });
  const pos = new Map();
  for (const idx of groups.values()) {
    const span = weeksPerPeriod(tasks[idx[0]]);
    idx.forEach((ti, k) => pos.set(ti, span === 1 ? k : Math.floor((k * span) / idx.length)));
  }
  return tasks.map((t, i) => (t.unit === 'day' || t.unit === 'need' ? t : { ...t, pos: pos.get(i) }));
}

// ---------- Feiertage (Österreich) ----------

function easter(y) { // Gauß/Meeus, gregorianisch
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return dayOf(y, month, day);
}
// Map 'YYYY-MM-DD' → Name der gesetzlichen Feiertage eines Jahres
export function holidays(y) {
  const e = easter(y);
  const list = [
    [dayOf(y, 1, 1), 'Neujahr'], [dayOf(y, 1, 6), 'Heilige Drei Könige'], [e + 1, 'Ostermontag'],
    [dayOf(y, 5, 1), 'Staatsfeiertag'], [e + 39, 'Christi Himmelfahrt'], [e + 50, 'Pfingstmontag'],
    [e + 60, 'Fronleichnam'], [dayOf(y, 8, 15), 'Mariä Himmelfahrt'], [dayOf(y, 10, 26), 'Nationalfeiertag'],
    [dayOf(y, 11, 1), 'Allerheiligen'], [dayOf(y, 12, 8), 'Mariä Empfängnis'], [dayOf(y, 12, 25), 'Christtag'],
    [dayOf(y, 12, 26), 'Stefanitag'],
  ];
  return new Map(list.map(([d, n]) => [fromDay(d), n]));
}

// ---------- Zuteilung ----------

// Paket A gehört Person 1, Paket B Person 2 (fix; kein Pakettausch). swapped dreht nur um (alte Daten).
export function packageOwners(ctx) {
  const [p1, p2] = ctx.persons.map((p) => p.id);
  return ctx.swapped ? [p2, p1] : [p1, p2];
}

// Zuständige Person für eine Periode. null = gemeinsam.
export function ownerOf(task, period, day, slot, ctx) {
  switch (task.assign) {
    case 'shared': return null;
    case 'each': return slot;
    case 'alternate': {
      const scheme = periodScheme(task, toDay(ctx.setup));
      const odd = mod(period.index - scheme.indexAt(toDay(ctx.setup)), 2) === 1;
      return ctx.persons[odd !== !!ctx.swapped ? 1 : 0].id;
    }
    default: {
      const [a, b] = packageOwners(ctx);
      return task.assign === 'A' ? a : b;
    }
  }
}

// ---------- Aufwand & faire Aufteilung ----------

// Wie oft pro Monat? täglich 30 · wöchentlich 4,3 · alle 2 Wochen 2,2 · monatlich 1 · vierteljährlich 1/3 …
// Bei Bedarf: geschätzte Anzahl (perMonth). Saisonaufgaben nur anteilig (Saisonmonate / 12).
export function timesPerMonth(task) {
  const k = kindOf(task);
  let n = k === 'asneeded' ? Number(task.perMonth) || 0
    : k === 'biweekly' ? 2.2
      : { day: 30, week: 4.3, month: 1 }[task.unit] / task.n;
  if (task.season) n *= (mod(task.season.to - task.season.from, 12) + 1) / 12;
  return n;
}
export const monthlyMinutes = (task) => (Number(task.min) || 0) * timesPerMonth(task);

// Aufwand pro Person und Monat (Minuten): Pakete A/B, Gemeinsames und Abwechselndes je zur Hälfte, „pro Person“ voll.
export function loadByPerson(tasks, ctx) {
  const out = Object.fromEntries(ctx.persons.map((p) => [p.id, 0]));
  for (const t of tasks) {
    const m = monthlyMinutes(t);
    if (t.assign === 'A' || t.assign === 'B') {
      const [a, b] = packageOwners(ctx);
      out[t.assign === 'A' ? a : b] += m;
    } else {
      for (const id in out) out[id] += t.assign === 'each' ? m : m / ctx.persons.length;
    }
  }
  return out;
}

// Pakete A/B fair aufteilen – je Intervall für sich: beide bekommen gleich viele Aufgaben (±1) und
// möglichst gleich viel Aufwand (alle Varianten durchprobiert, bei bis zu 16 Aufgaben pro Intervall).
// Danach bekommt die Person mit bisher weniger Gesamtaufwand jeweils die größere Hälfte.
// Gemeinsames, Abwechselndes und „pro Person“ bleiben unverändert.
export function autoSplit(tasks) {
  const groups = new Map();
  tasks.forEach((t, i) => {
    if (t.assign !== 'A' && t.assign !== 'B') return;
    const g = `${t.n}${t.unit}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(i);
  });
  const halves = [...groups.values()].map((idx) => {
    const m = idx.map((i) => monthlyMinutes(tasks[i]));
    const total = m.reduce((a, b) => a + b, 0);
    let best = null;
    if (idx.length <= 16) {
      for (let mask = 0; mask < 1 << idx.length; mask++) {
        let n = 0, sum = 0;
        for (let k = 0; k < idx.length; k++) if (mask & (1 << k)) { n++; sum += m[k]; }
        if (Math.abs(2 * n - idx.length) > 1) continue;
        const diff = Math.abs(2 * sum - total);
        if (!best || diff < best.diff - 1e-9) best = { diff, mask, sum };
      }
    } else { // sehr viele Aufgaben: abwechselnd nach Aufwand
      const order = idx.map((_, k) => k).sort((a, b) => m[b] - m[a]);
      let mask = 0, sum = 0;
      order.forEach((k, r) => { if (r % 2 === 0) { mask |= 1 << k; sum += m[k]; } });
      best = { mask, sum };
    }
    const one = idx.filter((_, k) => best.mask & (1 << k)), other = idx.filter((_, k) => !(best.mask & (1 << k)));
    const big = best.sum >= total - best.sum ? [one, other, best.sum, total - best.sum] : [other, one, total - best.sum, best.sum];
    return { big: big[0], small: big[1], bigSum: big[2], smallSum: big[3] };
  }).sort((a, b) => (b.bigSum - b.smallSum) - (a.bigSum - a.smallSum));

  const load = { A: 0, B: 0 };
  const assign = new Map();
  for (const h of halves) {
    const [lo, hi] = load.A <= load.B ? ['A', 'B'] : ['B', 'A'];
    h.big.forEach((i) => assign.set(i, lo));
    h.small.forEach((i) => assign.set(i, hi));
    load[lo] += h.bigSum;
    load[hi] += h.smallSum;
  }
  return tasks.map((t, i) => (assign.has(i) ? { ...t, assign: assign.get(i) } : t));
}

// ---------- Abwesenheit ----------

// ctx.away = { personId: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } }
// Überschneidet sich die Abwesenheit mit dem Zeitraum [a, b] (Tagesnummern)?
export function awayDuring(ctx, personId, a, b) {
  const r = ctx.away?.[personId];
  return !!(r?.from && r?.to && toDay(r.from) <= b && toDay(r.to) >= a);
}
// Pausiert = zuständige Person war weg (bei Gemeinsamem: beide)
const paused = (ctx, owner, a, b) => (owner === null
  ? ctx.persons.every((p) => awayDuring(ctx, p.id, a, b))
  : awayDuring(ctx, owner, a, b));

// ---------- Status ----------

export const completionId = (taskId, key, slot) => `${taskId}__${key}__${slot ?? 'x'}`;
export const slotsOf = (task, ctx) => (task.assign === 'each' ? ctx.persons.map((p) => p.id) : [null]);

// Aktuelle und vorherige Periode samt Fälligkeit; gap = heute liegt zwischen zwei Perioden.
function periodsAround(task, ctx, today) {
  const setupDay = toDay(ctx.setup);
  const scheme = periodScheme(task, setupDay);
  const i = scheme.indexAt(today);
  const cur = scheme.byIndex(i);
  const gap = today > cur.end;
  const prev = gap ? cur : scheme.byIndex(i - 1);
  return { scheme, i, cur: gap ? null : cur, prev };
}

// Alle Periodenschlüssel, deren Erledigung für den heutigen Stand relevant ist.
export function relevantKeys(tasks, ctx, todayStr) {
  const today = toDay(todayStr);
  const keys = new Set();
  for (const t of tasks) {
    if (kindOf(t) === 'asneeded') { keys.add(`need:${todayStr}`); continue; }
    const { cur, prev } = periodsAround(t, ctx, today);
    if (cur) keys.add(cur.key);
    keys.add(prev.key);
  }
  return [...keys].sort();
}

// Aufgaben zählen frühestens ab dem Start des Plans (Einrichtung, in den Optionen änderbar)
const startOf = (task, ctx) => Math.max(toDay(task.created || ctx.setup), toDay(ctx.setup));

// Bei Bedarf: jeden Tag abhakbar (Schlüssel = Tag), nie fällig oder überfällig
function evaluateNeed(task, ctx, todayStr, completions) {
  const today = toDay(todayStr);
  const key = `need:${todayStr}`;
  const offseason = !inSeason(task.season, ymd(today)[1]);
  return slotsOf(task, ctx).map((slot) => {
    const done = completions.get(completionId(task.id, key, slot)) || null;
    const owner = task.assign === 'each' ? slot
      : task.assign === 'A' || task.assign === 'B' ? ownerOf(task, null, today, slot, ctx) : null;
    return {
      task, slot, owner, status: offseason ? 'offseason' : done ? 'done' : 'need',
      key: offseason ? null : key, due: null, end: null, completion: done, next: null,
    };
  });
}

/**
 * Bewertet eine Aufgabe für heute. Liefert pro Slot ein Element:
 * { task, slot, owner, status, key, due, end, completion, next }
 * status: due | overdue | upcoming | done | idle | offseason | need (bei Bedarf)
 *  - key: Periode, in die ein Abhaken geschrieben wird
 *  - due: Termin (Putztag); end: letzter Tag des Spielraums
 *  - next: nächster Termin (bei idle/offseason/done)
 * Ist der Spielraum vorbei, gilt die Aufgabe als vergessen (overdue). Tägliches verfällt einfach;
 * während einer Abwesenheit pausiert die Aufgabe.
 */
export function evaluate(task, ctx, todayStr, completions) {
  if (kindOf(task) === 'asneeded') return evaluateNeed(task, ctx, todayStr, completions);
  const today = toDay(todayStr);
  const start = startOf(task, ctx);
  const daily = kindOf(task) === 'daily';
  const slack = slackOf(task);
  const { scheme, i, cur, prev } = periodsAround(task, ctx, today);
  const get = (key, slot) => completions.get(completionId(task.id, key, slot));
  const offseason = !inSeason(task.season, ymd(today)[1]);

  return slotsOf(task, ctx).map((slot) => {
    const at = (p) => {
      const owner = ownerOf(task, p, p.start, slot, ctx);
      const due = dueDay(task, p, ctx, owner);
      return { p, owner, due, end: due === null ? null : due + slack, counts: due !== null && due >= start };
    };
    const nextDue = () => {
      for (let k = i + 1; k < i + 400; k++) {
        const x = at(scheme.byIndex(k));
        if (x.counts && x.due > today) return x;
      }
      return null;
    };
    const item = { task, slot, owner: null, status: 'idle', key: null, due: null, end: null, completion: null, next: null };
    const set = (status, x, key, extra = {}) => Object.assign(item, {
      status, key, owner: x.owner, due: fromDay(x.due), end: fromDay(x.end), ...extra,
    });
    const idle = () => {
      const n = nextDue();
      Object.assign(item, { next: n ? fromDay(n.due) : null, owner: n ? n.owner : (task.assign === 'each' ? slot : null) });
      return item;
    };
    if (offseason) {
      item.status = 'offseason';
      return idle();
    }

    const c = cur && at(cur);
    const pv = at(prev);
    const pvDone = get(prev.key, slot);
    const pvOpen = !daily && pv.counts && !pvDone;
    const pvPaused = pvOpen && paused(ctx, pv.owner, pv.due, pv.end);

    if (c?.counts && get(cur.key, slot)) {
      const n = nextDue();
      set('done', c, cur.key, { completion: get(cur.key, slot), next: n ? fromDay(n.due) : null });
      return item;
    }
    // vorheriger Termin noch im Spielraum
    if (pvOpen && !pvPaused && today <= pv.end) return set('due', pv, prev.key);
    // aktueller Termin samt Spielraum schon vorbei → vergessen
    if (c?.counts && !daily && today > c.end) {
      if (paused(ctx, c.owner, c.due, c.end)) return idle();
      return set('overdue', c, cur.key);
    }
    // vorheriger Termin verpasst: einmal überfällig, bei der Person, die ihn verpasst hat;
    // Abhaken zählt dann für die aktuelle Periode
    if (pvOpen && !pvPaused) return set('overdue', pv, c?.counts ? cur.key : prev.key);
    if (c?.counts) return set(today < c.due ? 'upcoming' : 'due', c, cur.key);
    if (prev && pvDone && pv.counts) item.completion = pvDone;
    return idle();
  });
}

// ---------- Kalender ----------

// Zeitfenster einer Aufgabe, die den Bereich [fromStr, toStr] berühren.
// Liefert [{ task, slot, owner, key, start, end }] (start/end als 'YYYY-MM-DD').
export function windowsBetween(task, ctx, fromStr, toStr) {
  if (kindOf(task) === 'asneeded') return [];
  const from = toDay(fromStr), to = toDay(toStr);
  const start = startOf(task, ctx);
  const slack = slackOf(task);
  const scheme = periodScheme(task, toDay(ctx.setup));
  const out = [];
  for (let k = scheme.indexAt(from) - 1; k <= scheme.indexAt(to) + 1; k++) {
    const p = scheme.byIndex(k);
    for (const slot of slotsOf(task, ctx)) {
      const owner = ownerOf(task, p, p.start, slot, ctx);
      const due = dueDay(task, p, ctx, owner);
      if (due === null || due < start || due > to || due + slack < from) continue;
      out.push({ task, slot, owner, key: p.key, start: fromDay(due), end: fromDay(due + slack) });
    }
  }
  return out;
}
