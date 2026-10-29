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

const FIXED_DAY_KINDS = new Set(['halfyear', 'yearly']);
export const usesSharedDay = (task) => FIXED_DAY_KINDS.has(kindOf(task));

// Liefert für eine Aufgabe: indexAt(tag) → Periodenindex, byIndex(i) → {key, index, start, end}.
// Bei "halbjährlich" liefert indexAt in den Lücken (Jun–Aug, Dez–Feb) die zuletzt vergangene Periode.
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
      const base = monday(setupDay) + (task.wk ? 7 : 0); // wk: Rhythmus um eine Woche versetzt
      return {
        indexAt: (d) => Math.floor((d - base) / 14),
        byIndex: (i) => mk(i, base + 14 * i, base + 14 * i + 13),
      };
    }
    case 'monthly':
    case 'quarterly':
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
    case 'halfyear':
      return {
        indexAt: (d) => {
          const [y, m] = ymd(d);
          if (m < 3) return (y - 1) * 2 + 1;
          if (m < 9) return y * 2;
          return y * 2 + 1;
        },
        byIndex: (i) => {
          const y = Math.floor(i / 2), autumn = mod(i, 2) === 1;
          const m = autumn ? 9 : 3;
          return mk(i, dayOf(y, m, 1), dayOf(y, m + 3, 1) - 1);
        },
      };
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

// Beginn des Zeitfensters: Längere Intervalle sind erst in der zweiten Hälfte ihrer Periode dran,
// damit zwischen zwei Durchgängen ungefähr gleich viel Zeit liegt (auch nach einem Pakettausch).
// alle 2 Wochen → 2. Woche, monatlich → ab dem 15., vierteljährlich → 3. Monat.
// Mit Wochentag (task.wd, Mo=0 … So=6) ist eine Wochenaufgabe erst ab diesem Tag dran.
function windowStart(task, period) {
  const kind = kindOf(task);
  const [y, m] = ymd(period.start);
  const wd = Number.isInteger(task.wd) ? task.wd : 0;
  switch (kind) {
    case 'daily': return period.start;
    case 'weekly': return period.start + wd;
    case 'biweekly': return period.start + 7 + wd;
    case 'monthly': return dayOf(y, m, 15);
    case 'quarterly': return dayOf(y, m + 2, 1);
    default:
      if (task.unit === 'month') return task.n < 2 ? dayOf(y, m, 15) : dayOf(y, m + Math.floor(task.n / 2), 1);
      if (task.unit === 'week') return period.start + Math.floor(task.n / 2) * 7;
      return period.start + Math.floor(task.n / 2);
  }
}

// Fälligkeitstag einer Periode (Beginn des Zeitfensters; bei halbjährlich/jährlich der gemeinsame Tag),
// in die Saison verschoben. null = Periode liegt ganz außerhalb der Saison.
export function dueDay(task, period, ctx) {
  const kind = kindOf(task);
  let base = windowStart(task, period);
  if (kind === 'halfyear' || kind === 'yearly') {
    const [y] = ymd(period.start);
    const sd = ctx.sharedDay;
    const m = kind === 'yearly' ? sd.yearlyMonth : sd.halfyearMonth + (ymd(period.start)[1] === 9 ? 6 : 0);
    base = dayOf(y, m, Math.min(kind === 'yearly' ? sd.yearlyDay : sd.halfyearDay, daysInMonth(y, m)));
  }
  if (!task.season) return base;
  const ok = (d) => inSeason(task.season, ymd(d)[1]);
  if (ok(base)) return base;
  if (task.unit !== 'month') return null; // Tage/Wochen: Periode zählt nur, wenn sie in der Saison beginnt
  // erster Saisontag nach dem Basistag, sonst ab Periodenbeginn
  const firsts = [];
  for (let [y, m] = ymd(period.start); dayOf(y, m, 1) <= period.end; m++) firsts.push(dayOf(y, m, 1));
  return firsts.find((d) => d > base && ok(d)) ?? firsts.find((d) => ok(d) && d >= period.start) ?? null;
}

// ---------- Rotation ----------

export const GROUPS = ['short', 'quarter', 'half', 'year'];

export function groupOf(task) {
  const days = task.n * (task.unit === 'month' ? 30.5 : task.unit === 'week' ? 7 : 1);
  if (days <= 31) return 'short';
  if (days <= 92) return 'quarter';
  if (days <= 183) return 'half';
  return 'year';
}

// Paket-Tausch jeweils am Monatsersten, alle `rhythm` Monate ab dem Einrichtungsmonat.
export function swapIndex(rhythm, ctx, day) {
  return Math.floor((monthIndex(day) - monthIndex(toDay(ctx.setup))) / rhythm);
}

export function nextSwap(group, ctx, today) {
  const r = ctx.rotation[group];
  const mi = monthIndex(toDay(ctx.setup)) + (swapIndex(r, ctx, toDay(today)) + 1) * r;
  return fromDay(dayOf(Math.floor(mi / 12), mod(mi, 12) + 1, 1));
}

// Wer hat Paket A/B zu einem Tag (für eine Intervallgruppe)? → [personIdA, personIdB]
// rotationOff: Pakettausch abgeschaltet → Pakete bleiben fix (nur „Zuteilung umdrehen“ wirkt)
export function packageOwners(group, ctx, day) {
  const swaps = ctx.rotationOff ? 0 : mod(swapIndex(ctx.rotation[group], ctx, day), 2);
  const flip = (swaps === 1) !== !!ctx.swapped;
  const [p1, p2] = ctx.persons.map((p) => p.id);
  return flip ? [p2, p1] : [p1, p2];
}

// Zuständige Person für eine Periode. null = gemeinsam.
export function ownerOf(task, period, due, slot, ctx) {
  switch (task.assign) {
    case 'shared': return null;
    case 'each': return slot;
    case 'alternate': {
      const scheme = periodScheme(task, toDay(ctx.setup));
      const odd = mod(period.index - scheme.indexAt(toDay(ctx.setup)), 2) === 1;
      return ctx.persons[odd !== !!ctx.swapped ? 1 : 0].id;
    }
    default: {
      const [a, b] = packageOwners(groupOf(task), ctx, due);
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

// Aufwand pro Person und Monat (Minuten) zu einem Tag: Pakete nach aktueller Zuteilung,
// Gemeinsames und Abwechselndes je zur Hälfte, „pro Person“ voll.
export function loadByPerson(tasks, ctx, day) {
  const out = Object.fromEntries(ctx.persons.map((p) => [p.id, 0]));
  for (const t of tasks) {
    const m = monthlyMinutes(t);
    if (t.assign === 'A' || t.assign === 'B') {
      const [a, b] = packageOwners(groupOf(t), ctx, day);
      out[t.assign === 'A' ? a : b] += m;
    } else {
      for (const id in out) out[id] += t.assign === 'each' ? m : m / ctx.persons.length;
    }
  }
  return out;
}

// Pakete A/B fair aufteilen: je Intervallgruppe (die getrennt rotieren) nach Aufwand absteigend,
// jede Aufgabe kommt ins Paket mit bisher weniger Aufwand. Andere Zuteilungen bleiben unverändert.
export function autoSplit(tasks) {
  const sum = {};
  const order = tasks.map((t, i) => [t, i])
    .filter(([t]) => t.assign === 'A' || t.assign === 'B')
    .sort(([a, i], [b, j]) => monthlyMinutes(b) - monthlyMinutes(a) || i - j);
  const assign = new Map();
  for (const [t, i] of order) {
    const g = sum[groupOf(t)] ||= { A: 0, B: 0 };
    const p = g.A <= g.B ? 'A' : 'B';
    g[p] += monthlyMinutes(t);
    assign.set(i, p);
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
 *  - due: Fälligkeitstag = Beginn des Zeitfensters (bei overdue der verpasste)
 *  - end: Ende des Zeitfensters (bei due/upcoming/overdue)
 *  - next: nächster Fälligkeitstag (bei idle/offseason/done)
 * Tägliches verfällt (wird nie überfällig); während einer Abwesenheit pausiert die Aufgabe.
 */
export function evaluate(task, ctx, todayStr, completions) {
  if (kindOf(task) === 'asneeded') return evaluateNeed(task, ctx, todayStr, completions);
  const today = toDay(todayStr);
  const created = startOf(task, ctx);
  const fixed = usesSharedDay(task);
  const { scheme, i, cur, prev } = periodsAround(task, ctx, today);
  const get = (key, slot) => completions.get(completionId(task.id, key, slot));

  const curDue = cur ? dueDay(task, cur, ctx) : null;
  // aktuelle Periode zählt, wenn es die Aufgabe am (festen) Fälligkeitstag schon gab
  const curCounts = curDue !== null && created <= (fixed ? curDue : cur.end);
  const prevDue = dueDay(task, prev, ctx);
  const prevCounts = prevDue !== null && created <= prevDue && kindOf(task) !== 'daily';

  const nextDue = () => {
    for (let k = i + 1; k < i + 400; k++) {
      const p = scheme.byIndex(k), d = dueDay(task, p, ctx);
      if (d !== null && d > today) return fromDay(d);
    }
    return null;
  };

  const offseason = !inSeason(task.season, ymd(today)[1]);
  const ownerAt = (dueStr, slot) => {
    if (!dueStr) return task.assign === 'each' ? slot : null;
    const d = toDay(dueStr);
    return ownerOf(task, scheme.byIndex(scheme.indexAt(d)), d, slot, ctx);
  };

  return slotsOf(task, ctx).map((slot) => {
    const item = { task, slot, owner: null, status: 'idle', key: null, due: null, end: null, completion: null, next: null };
    if (offseason) {
      item.status = 'offseason';
      item.next = nextDue();
      item.owner = ownerAt(item.next, slot);
      return item;
    }
    const prevMissed = prevCounts && !get(prev.key, slot)
      && !paused(ctx, ownerOf(task, prev, prevDue, slot, ctx), prevDue, prev.end);
    if (curCounts) {
      const done = get(cur.key, slot);
      item.key = cur.key;
      if (done) {
        Object.assign(item, { status: 'done', completion: done, owner: ownerOf(task, cur, curDue, slot, ctx), due: fromDay(curDue), next: nextDue() });
      } else if (prevMissed) {
        // verpasster Durchgang: einmal überfällig, bei der Person, die ihn verpasst hat
        Object.assign(item, { status: 'overdue', owner: ownerOf(task, prev, prevDue, slot, ctx), due: fromDay(prevDue), end: fromDay(prev.end) });
      } else {
        Object.assign(item, { status: today < curDue ? 'upcoming' : 'due', owner: ownerOf(task, cur, curDue, slot, ctx), due: fromDay(curDue), end: fromDay(cur.end) });
      }
      return item;
    }
    if (prevMissed) {
      Object.assign(item, { status: 'overdue', key: prev.key, owner: ownerOf(task, prev, prevDue, slot, ctx), due: fromDay(prevDue), end: fromDay(prev.end) });
      return item;
    }
    // nichts offen: nächste Fälligkeit, Zuständigkeit der nächsten Periode
    item.next = curDue !== null && curDue > today ? fromDay(curDue) : nextDue();
    item.owner = ownerAt(item.next, slot);
    if (prevCounts) item.completion = get(prev.key, slot) || null;
    return item;
  });
}

// ---------- Kalender ----------

// Zeitfenster einer Aufgabe, die den Bereich [fromStr, toStr] berühren.
// Liefert [{ task, slot, owner, key, start, end }] (start/end als 'YYYY-MM-DD').
export function windowsBetween(task, ctx, fromStr, toStr) {
  if (kindOf(task) === 'asneeded') return [];
  const from = toDay(fromStr), to = toDay(toStr);
  const created = startOf(task, ctx);
  const fixed = usesSharedDay(task);
  const scheme = periodScheme(task, toDay(ctx.setup));
  const out = [];
  for (let k = scheme.indexAt(from) - 1; k <= scheme.indexAt(to) + 1; k++) {
    const p = scheme.byIndex(k), due = dueDay(task, p, ctx);
    if (due === null || due > to || p.end < from || created > (fixed ? due : p.end)) continue;
    for (const slot of slotsOf(task, ctx)) {
      out.push({ task, slot, owner: ownerOf(task, p, due, slot, ctx), key: p.key, start: fromDay(due), end: fromDay(p.end) });
    }
  }
  return out;
}
