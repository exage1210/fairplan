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

const inRange = (from, to, month) => (from <= to ? month >= from && month <= to : month >= from || month <= to);

// Saison { from, to }, optional zweiter Zeitraum { from2, to2 } (z. B. Frühling und Herbst)
export function inSeason(season, month) {
  if (!season) return true;
  return inRange(season.from, season.to, month) || (season.from2 != null && inRange(season.from2, season.to2, month));
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

// Je Person ein Paket: A beginnt bei Person 1, B bei Person 2 … Liefert die Person je Paket;
// turns = wie oft bisher getauscht wurde, die Pakete wandern reihum. swapped dreht nur um (alte Daten).
export const PACKAGES = ['A', 'B', 'C', 'D', 'E', 'F'];
export const MAX_PERSONS = PACKAGES.length;
export const isPackage = (assign) => PACKAGES.includes(assign);
export function packageOwners(ctx, turns = 0) {
  const ids = ctx.persons.map((p) => p.id);
  if (ctx.swapped) ids.reverse();
  return ids.map((_, i) => ids[(turns + i) % ids.length]);
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
// Würde die Aufgabe mit dem Monatstausch immer bei denselben Personen landen (etwa halbjährlich bei 2, vierteljährlich
// bei 3)? Dann wechselt sie stattdessen je Durchgang.
export const swapsByRound = (task, ctx) => task.unit === 'month' && gcd(task.n, ctx.persons.length) > 1;

// Monatlicher Tausch: ctx.rotateFrom = 'YYYY-MM', ab dem Monat danach wird am 1. getauscht; null = aus.
const rotationMonth = (ctx) => { const [y, m] = ctx.rotateFrom.split('-').map(Number); return y * 12 + m - 1; };
const monthStart = (mi) => dayOf(Math.floor(mi / 12), mod(mi, 12) + 1, 1);

// Liegt der Start weniger als 14 Tage vor dem Monatsersten, wird dieser Tausch übersprungen.
export function rotationBase(startStr) {
  const d = toDay(startStr);
  const next = monthStart(monthIndex(d) + 1);
  return fromDay(next - d < 14 ? next : d).slice(0, 7);
}
export const swapCount = (ctx, todayStr) => (ctx.rotateFrom ? Math.max(0, monthIndex(toDay(todayStr)) - rotationMonth(ctx)) : 0);
export function nextSwap(ctx, todayStr) {
  if (!ctx.rotateFrom) return null;
  return fromDay(monthStart(Math.max(monthIndex(toDay(todayStr)), rotationMonth(ctx)) + 1));
}

// Tausche für eine Aufgabe, gezählt am Beginn ihrer Periode: Wer dort zuständig ist, bleibt es bis zum Ende.
function turnsOf(task, period, day, ctx) {
  if (!ctx.rotateFrom || task.fixed) return 0;
  const start = period?.start ?? day;
  const base = rotationMonth(ctx);
  if (swapsByRound(task, ctx)) {
    const scheme = periodScheme(task, toDay(ctx.setup));
    return Math.max(0, scheme.indexAt(start) - scheme.indexAt(monthStart(base)));
  }
  return Math.max(0, monthIndex(start) - base);
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
      return packageOwners(ctx, turnsOf(task, period, day, ctx))[PACKAGES.indexOf(task.assign)];
    }
  }
}

// ---------- Aufwand & faire Aufteilung ----------

// Wie oft pro Monat? täglich 30 · wöchentlich 4,3 · alle 2 Wochen 2,2 · monatlich 1 · vierteljährlich 1/3 …
// Bei Bedarf: geschätzte Anzahl (perMonth). Saisonaufgaben nur anteilig (Saisonmonate / 12);
// Monats-, Quartals-, Halbjahres- und Jahresintervalle: Perioden im Jahr mit mindestens einem Saisonmonat / 12.
export function timesPerMonth(task) {
  const k = kindOf(task);
  if (task.season && task.unit === 'month' && 12 % task.n === 0) {
    let periods = 0;
    for (let m = 1; m <= 12; m += task.n) {
      if (Array.from({ length: task.n }, (_, j) => m + j).some((x) => inSeason(task.season, x))) periods++;
    }
    return periods / 12;
  }
  let n = k === 'asneeded' ? Number(task.perMonth) || 0
    : k === 'biweekly' ? 2.2
      : { day: 30, week: 4.3, month: 1 }[task.unit] / task.n;
  if (task.season) n *= Array.from({ length: 12 }, (_, m) => m + 1).filter((m) => inSeason(task.season, m)).length / 12;
  return n;
}
export const monthlyMinutes = (task) => (Number(task.min) || 0) * timesPerMonth(task);

// Aufwand pro Person und Monat (Minuten): Pakete A/B, Gemeinsames und Abwechselndes je zur Hälfte, „pro Person“ voll.
export function loadByPerson(tasks, ctx) {
  const out = Object.fromEntries(ctx.persons.map((p) => [p.id, 0]));
  for (const t of tasks) {
    const m = monthlyMinutes(t);
    if (isPackage(t.assign)) {
      out[packageOwners(ctx)[PACKAGES.indexOf(t.assign)]] += m;
    } else {
      for (const id in out) out[id] += t.assign === 'each' ? m : m / ctx.persons.length;
    }
  }
  return out;
}

// Pakete A/B fair nach Zeit aufteilen: insgesamt möglichst gleich viel Aufwand. Von häufig nach selten:
// Jedes Intervall wird so geteilt, dass der bisherige Unterschied möglichst klein wird. So ist das Spürbare
// (Wöchentliches) zuerst ausgeglichen, und seltene Aufgaben gleichen den Rest aus. Bei gleichem Ergebnis gewinnt
// die gleichmäßigere Anzahl. Gemeinsames, Abwechselndes und „pro Person“ bleiben unverändert.
// Ab 3 Personen: ebenso von häufig nach selten, die größte Aufgabe zuerst, jeweils an das Paket mit der wenigsten Zeit.
export function autoSplit(tasks, persons = 2) {
  const groups = new Map();
  tasks.forEach((t, i) => {
    if (!isPackage(t.assign)) return;
    const g = `${t.n}${t.unit}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(i);
  });
  const length = (t) => (t.unit === 'need' ? Infinity : t.n * { day: 1, week: 7, month: 30 }[t.unit]);
  const ordered = [...groups.values()].sort((a, b) => length(tasks[a[0]]) - length(tasks[b[0]]));
  if (persons > 2) {
    const load = Array(persons).fill(0);
    const assign = new Map();
    for (const idx of ordered) {
      const count = Array(persons).fill(0);
      [...idx].sort((a, b) => monthlyMinutes(tasks[b]) - monthlyMinutes(tasks[a])).forEach((i) => {
        const to = load.map((m, p) => p).sort((a, b) => load[a] - load[b] || count[a] - count[b] || a - b)[0];
        load[to] += monthlyMinutes(tasks[i]);
        count[to]++;
        assign.set(i, PACKAGES[to]);
      });
    }
    return tasks.map((t, i) => (assign.has(i) ? { ...t, assign: assign.get(i) } : t));
  }

  let lead = 0; // Vorsprung von A in Minuten pro Monat
  const assign = new Map();
  for (const idx of ordered) {
    const m = idx.map((i) => monthlyMinutes(tasks[i]));
    const total = m.reduce((a, b) => a + b, 0);
    let best = 0;
    if (idx.length <= 16) {
      let bestDiff = Infinity, bestSpread = Infinity;
      for (let mask = 0; mask < 1 << idx.length; mask++) {
        let n = 0, sum = 0;
        for (let k = 0; k < idx.length; k++) if (mask & (1 << k)) { n++; sum += m[k]; }
        const diff = Math.abs(lead + 2 * sum - total);
        const spread = Math.abs(2 * n - idx.length);
        if (diff < bestDiff - 1e-9 || (Math.abs(diff - bestDiff) <= 1e-9 && spread < bestSpread)) {
          bestDiff = diff; bestSpread = spread; best = mask;
        }
      }
    } else { // sehr viele Aufgaben: die größte zuerst, jeweils an die Person mit weniger
      let d = lead;
      idx.map((_, k) => k).sort((a, b) => m[b] - m[a]).forEach((k) => {
        if (d <= 0) { best |= 1 << k; d += m[k]; } else d -= m[k];
      });
    }
    idx.forEach((i, k) => {
      const toA = best & (1 << k);
      assign.set(i, toA ? 'A' : 'B');
      lead += toA ? m[k] : -m[k];
    });
  }
  return tasks.map((t, i) => (assign.has(i) ? { ...t, assign: assign.get(i) } : t));
}

// ---------- Abwesenheit ----------

// ctx.away = { personId: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } }
// Überschneidet sich die Abwesenheit mit dem Zeitraum [a, b] (Tagesnummern)?
// Von oder bis ändern: fehlt das andere oder passt es nicht mehr, gilt derselbe Tag. Das geänderte Datum gewinnt,
// Vertauschen ergäbe beim Eintragen einer neuen Zeit kurz einen Bereich vom alten Ende bis zum neuen Anfang.
export function moveRange(cur, field, value) {
  const next = { ...cur, [field]: value };
  if (!next.from || !next.to || next.to < next.from) { next.from = value; next.to = value; }
  return next;
}
// ctx.awayPast = { personId: [{ from, to }] }: was schon war, bleibt entschuldigt, auch wenn eine neue Abwesenheit eingetragen wird.
export function awayDuring(ctx, personId, a, b) {
  const hit = (r) => !!(r?.from && r?.to && toDay(r.from) <= b && toDay(r.to) >= a);
  return hit(ctx.away?.[personId]) || (ctx.awayPast?.[personId] || []).some(hit);
}
// Abwesenheit ändern oder löschen: Liefert die Felder fürs Speichern. Bereits vergangene Tage wandern nach awayPast.
export function changeAway(ctx, personId, next, todayStr) {
  const cur = ctx.away?.[personId];
  const yesterday = fromDay(toDay(todayStr) - 1);
  const list = ctx.awayPast?.[personId] || [];
  const kept = cur?.from && cur?.to && cur.from <= yesterday ? { from: cur.from, to: cur.to < yesterday ? cur.to : yesterday } : null;
  const known = kept && list.some((r) => r.from <= kept.from && r.to >= kept.to);
  return {
    away: { ...(ctx.away || {}), [personId]: next },
    ...(kept && !known ? { awayPast: { ...(ctx.awayPast || {}), [personId]: [...list, kept] } } : {}),
  };
}
// Haushalt pausieren: ctx.pauses = [{ from, to }], vergangene bleiben stehen, sonst zählten ihre Termine rückwirkend wieder.
// Getrennt von der Abwesenheit, beide dürfen sich überschneiden.
export const pauseDuring = (ctx, a, b) => (ctx.pauses || []).some((r) => r.from && r.to && toDay(r.from) <= b && toDay(r.to) >= a);
export const currentPause = (ctx, todayStr) => [...(ctx.pauses || [])].reverse().find((r) => r.to >= todayStr) || null;
// Von oder bis ändern; fehlt das andere, gilt derselbe Tag. Leer entfernt die Pause.
export function setPause(list = [], field, value, todayStr) {
  const cur = currentPause({ pauses: list }, todayStr);
  const rest = list.filter((r) => r !== cur);
  if (!value) return rest;
  return [...rest, moveRange(cur, field, value)];
}
// Beenden: Das Ende rückt auf gestern, damit nichts rückwirkend rot wird. Noch nicht begonnen: einfach weg.
export function endPause(list = [], todayStr) {
  const cur = currentPause({ pauses: list }, todayStr);
  if (!cur) return list;
  const rest = list.filter((r) => r !== cur);
  return cur.from >= todayStr ? rest : [...rest, { ...cur, to: fromDay(toDay(todayStr) - 1) }];
}
// Pausiert = Haushalt pausiert oder zuständige Person war weg (bei Gemeinsamem: alle)
const paused = (ctx, owner, a, b) => pauseDuring(ctx, a, b) || (owner === null
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

// ---------- Joker ----------

// Pro Person ein Feld im Haushalt, joker_<id> = { progress, count, earned, deferred: { <completionId des Termins>: Tag } }.
// So schreibt jede Person nur ihr eigenes Feld, und Statistik und Verlauf bleiben unberührt.
export const JOKER_PRICE = 30;
export const JOKER_MAX = 3;
const JOKER_DAYS = 7;
export const jokerOf = (ctx, id) => ({ progress: 0, count: 0, earned: 0, deferred: {}, ...ctx[`joker_${id}`] });
const isDeferred = (ctx, owner, id) => owner != null && !!ctx[`joker_${owner}`]?.deferred?.[id];

// Eigene Abmachung erledigt (+1) oder zurückgenommen (-1). Bei vollem Vorrat zählt nichts weiter.
// id = Erledigung: earnedBy merkt sich, welche den letzten Joker gebracht hat, sonst wäre der volle Vorrat nicht unterscheidbar.
// Ist der Joker schon eingesetzt, bleibt die Frist; es entsteht ein Minus beim Fortschritt („noch 31 bis Joker“).
export function jokerTick(j, delta, id = null) {
  if (delta > 0) {
    if (j.count >= JOKER_MAX) return j;
    return j.progress + 1 >= JOKER_PRICE
      ? { ...j, progress: 0, count: j.count + 1, earned: j.earned + 1, earnedBy: id }
      : { ...j, progress: j.progress + 1 };
  }
  if (j.progress > 0) return { ...j, progress: j.progress - 1 };
  if (j.count >= JOKER_MAX && (!id || id !== j.earnedBy)) return j;
  if (j.count === 0) return j.earned > 0 ? { ...j, progress: j.progress - 1 } : j;
  return { ...j, progress: JOKER_PRICE - 1, count: j.count - 1, earned: Math.max(0, j.earned - 1), earnedBy: null };
}

// Joker möglich? Offen, mit Person, nicht Tägliches oder Bei Bedarf, und die neue Frist liegt nicht schon hinter uns.
export const canJoker = (item, todayStr) => ['due', 'overdue'].includes(item.status) && item.owner != null && !item.deferred
  && !['daily', 'asneeded'].includes(kindOf(item.task)) && toDay(item.end) + JOKER_DAYS >= toDay(todayStr);

// Joker einsetzen: Verbrauch und Merker; Einträge älter als 120 Tage fallen weg.
export function useJoker(j, termId, todayStr) {
  const deferred = Object.fromEntries(Object.entries(j.deferred).filter(([, d]) => toDay(todayStr) - toDay(d) <= 120));
  return { ...j, count: j.count - 1, deferred: { ...deferred, [termId]: todayStr } };
}

// Persönliche Woche: Wöchentliches und „alle 2 Wochen“ laufen vom Termin bis zum Tag vor dem nächsten, ohne Spielraum.
export const isRolling = (task) => ['weekly', 'biweekly'].includes(kindOf(task));

// Termine der Perioden fromI…toI, nach Datum: [{ p, owner, due, end, key, counts }].
// Wöchentliches mit Tausch gehört der Person, deren Putztag im passenden Monat liegt. Eine Woche kann so zwei Termine
// haben (der zweite bekommt den Schlüssel mit „b“) oder keinen. „Alle 2 Wochen“ hat immer einen Termin je Block,
// sonst fiele beim Tausch ein ganzer Durchgang aus oder käme doppelt.
function rollingTerms(task, ctx, slot, fromI, toI) {
  const scheme = periodScheme(task, toDay(ctx.setup));
  const start = startOf(task, ctx);
  const len = task.n * 7;
  const pkg = PACKAGES.indexOf(task.assign);
  const byMonth = kindOf(task) === 'weekly' && ctx.rotateFrom && !task.fixed && pkg >= 0;
  const terms = [];
  for (let k = fromI; k <= toI + 3; k++) {
    const p = scheme.byIndex(k);
    const owners = byMonth ? ctx.persons.map((x) => x.id) : [ownerOf(task, p, p.start, slot, ctx)];
    owners.map((owner) => ({ p, k, owner, due: dueDay(task, p, ctx, owner) }))
      .filter((x) => x.due !== null
        && (!byMonth || packageOwners(ctx, Math.max(0, monthIndex(x.due) - rotationMonth(ctx)))[pkg] === x.owner))
      .sort((a, b) => a.due - b.due)
      .forEach((x, n) => terms.push({ ...x, key: n ? `${p.key}b` : p.key, counts: x.due >= start }));
  }
  return terms.map((x, n) => {
    const next = terms[n + 1];
    const def = isDeferred(ctx, x.owner, completionId(task.id, x.key, slot));
    return { ...x, def, end: (next && next.due - x.due <= 2 * len ? next.due - 1 : x.due + len - 1) + (def ? JOKER_DAYS : 0) };
  }).filter((x) => x.k <= toI);
}
const rollingAround = (task, ctx, slot, today) => {
  const i = periodScheme(task, toDay(ctx.setup)).indexAt(today);
  return { i, terms: rollingTerms(task, ctx, slot, i - 2, i + 1) };
};

// Eigene Woche: vom ersten Putztag der Person an, 7 Tage. Liefert ['YYYY-MM-DD', 'YYYY-MM-DD'].
export function personalWeek(days, todayStr) {
  const first = days?.length ? Math.min(...days) : 5;
  const t = toDay(todayStr);
  const from = t - mod(weekday(t) - first, 7);
  return [fromDay(from), fromDay(from + 6)];
}

// Drängt heute? Vergessenes immer; Wöchentliches und „alle 2 Wochen“ nur am Termin und am Tag danach.
export const isPressing = (item, todayStr) => item.status === 'overdue'
  || (item.status === 'due' && !item.deferred && (!isRolling(item.task) || toDay(todayStr) <= toDay(item.due) + 1));

// Fällt die Zeile wegen der Haushalts-Pause weg? Während der Pause alles, davor, was in die Pause fällt.
export const pausedItem = (item, ctx, todayStr) => pauseDuring(ctx, toDay(todayStr), toDay(todayStr))
  || !!(item.due && item.end && pauseDuring(ctx, toDay(item.due), toDay(isRolling(item.task) ? item.due : item.end)));

// Reihenfolge auf „Aktuell“: Vergessenes, was heute drängt, was noch Zeit hat, was erst kommt
export const urgency = (item, todayStr) => (item.status === 'overdue' ? 0 : item.status === 'upcoming' ? 3 : isPressing(item, todayStr) ? 1 : 2);

// Wer ist heute für die laufende Periode zuständig?
export function ownerNow(task, ctx, todayStr) {
  const today = toDay(todayStr);
  if (kindOf(task) === 'asneeded') return ownerOf(task, null, today, null, ctx);
  if (isRolling(task)) {
    const { terms } = rollingAround(task, ctx, null, today);
    const now = terms.filter((x) => x.due <= today).pop() ?? terms.find((x) => x.due > today);
    if (now) return now.owner;
  }
  return ownerOf(task, periodsAround(task, ctx, today).cur, today, null, ctx);
}

// Alle Periodenschlüssel, deren Erledigung für den heutigen Stand relevant ist.
export function relevantKeys(tasks, ctx, todayStr) {
  const today = toDay(todayStr);
  const keys = new Set();
  for (const t of tasks) {
    if (kindOf(t) === 'asneeded') { keys.add(`need:${todayStr}`); continue; }
    if (isRolling(t)) {
      for (const slot of slotsOf(t, ctx)) for (const x of rollingAround(t, ctx, slot, today).terms) keys.add(x.key);
      continue;
    }
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
      : isPackage(task.assign) ? ownerOf(task, null, today, slot, ctx) : null;
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
  if (isRolling(task)) return evaluateRolling(task, ctx, todayStr, completions);
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
      const def = isDeferred(ctx, owner, completionId(task.id, p.key, slot));
      return { p, owner, due, def, end: due === null ? null : due + slack + (def ? JOKER_DAYS : 0), counts: due !== null && due >= start };
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
      status, key, owner: x.owner, due: fromDay(x.due), end: fromDay(x.end), termKey: x.p.key, deferred: !!x.def, ...extra,
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

// Wöchentlich und alle 2 Wochen: wie evaluate, aber nach Terminen statt Kalenderperioden.
// Vorziehen geht ab Beginn der Kalenderperiode des Termins, sobald der laufende Termin erledigt ist.
function evaluateRolling(task, ctx, todayStr, completions) {
  const today = toDay(todayStr);
  const offseason = !inSeason(task.season, ymd(today)[1]);
  return slotsOf(task, ctx).map((slot) => {
    const { i, terms } = rollingAround(task, ctx, slot, today);
    const list = terms.filter((x) => x.counts);
    const past = list.filter((x) => x.due <= today);
    const cur = past[past.length - 1];
    const prv = past[past.length - 2];
    const get = (x) => completions.get(completionId(task.id, x.key, slot));
    const after = (day, owner) => {
      for (let k = i - 2; k < i + 400; k++) {
        const x = rollingTerms(task, ctx, slot, k, k).find((y) => y.counts && y.due > day && (owner === undefined || y.owner === owner));
        if (x) return x;
      }
      return null;
    };
    const item = { task, slot, owner: null, status: 'idle', key: null, due: null, end: null, completion: null, next: null };
    const set = (status, x, key, extra = {}) => Object.assign(item, {
      status, key, owner: x.owner, due: fromDay(x.due), end: fromDay(x.end), termKey: x.key, deferred: !!x.def, ...extra,
    });
    const idle = () => {
      const n = after(today);
      Object.assign(item, { next: n ? fromDay(n.due) : null, owner: n ? n.owner : (task.assign === 'each' ? slot : null) });
      return item;
    };
    const done = (x) => {
      const n = after(x.due, x.owner); // nächster eigener Termin: nach dem Tausch kommt die andere Person zuerst
      return set('done', x, x.key, { completion: get(x), next: n ? fromDay(n.due) : null });
    };
    if (offseason) {
      item.status = 'offseason';
      return idle();
    }
    const open = (x) => x && !paused(ctx, x.owner, x.due, x.end) && !get(x);
    if (cur && !get(cur)) {
      // voriger Termin verpasst: einmal überfällig, bei der Person, die ihn verpasst hat; Abhaken zählt für den laufenden.
      // Mit Joker läuft seine Frist noch: bleibt bei dieser Person und deckt die neue Runde mit ab.
      if (open(prv)) return set(today <= prv.end ? 'due' : 'overdue', prv, cur.key);
      if (today <= cur.end) return set('due', cur, cur.key);
      if (paused(ctx, cur.owner, cur.due, cur.end)) return idle();
      return set('overdue', cur, cur.key);
    }
    // Heute Erledigtes bleibt heute „erledigt“ (zählt in der Statuskarte), erst danach lässt sich vorziehen
    const nxt = cur && get(cur)?.day === todayStr ? null : after(today);
    if (nxt && nxt.p.start <= today) return get(nxt) ? done(nxt) : set('upcoming', nxt, nxt.key);
    return cur ? done(cur) : idle();
  });
}

// ---------- Kalender ----------

// Zeitfenster einer Aufgabe, die den Bereich [fromStr, toStr] berühren.
// Liefert [{ task, slot, owner, key, start, end }] (start/end als 'YYYY-MM-DD').
export function windowsBetween(task, ctx, fromStr, toStr) {
  if (kindOf(task) === 'asneeded') return [];
  const from = toDay(fromStr), to = toDay(toStr);
  if (isRolling(task)) {
    const scheme = periodScheme(task, toDay(ctx.setup));
    return slotsOf(task, ctx).flatMap((slot) => rollingTerms(task, ctx, slot, scheme.indexAt(from) - 2, scheme.indexAt(to) + 1)
      .filter((x) => x.counts && x.due <= to && x.end >= from)
      .map((x) => ({ task, slot, owner: x.owner, key: x.key, start: fromDay(x.due), end: fromDay(x.end), deferred: x.def })));
  }
  const start = startOf(task, ctx);
  const slack = slackOf(task);
  const scheme = periodScheme(task, toDay(ctx.setup));
  const out = [];
  for (let k = scheme.indexAt(from) - 1; k <= scheme.indexAt(to) + 1; k++) {
    const p = scheme.byIndex(k);
    for (const slot of slotsOf(task, ctx)) {
      const owner = ownerOf(task, p, p.start, slot, ctx);
      const due = dueDay(task, p, ctx, owner);
      const def = isDeferred(ctx, owner, completionId(task.id, p.key, slot));
      const end = due === null ? null : due + slack + (def ? JOKER_DAYS : 0);
      if (due === null || due < start || due > to || end < from) continue;
      out.push({ task, slot, owner, key: p.key, start: fromDay(due), end: fromDay(end), deferred: def });
    }
  }
  return out;
}

// Vorher abhaken: die nächste Runde eigener Aufgaben in den kommenden Tagen, je Aufgabe und Slot höchstens eine.
// Nur eigene, ohne Tägliches und Bei Bedarf, nie ab dem nächsten Tauschtag; Verschobenes und Termine in der eigenen
// Abwesenheit nur, wenn sie schon erledigt sind. Der Haken zählt über den Schlüssel für diesen Termin.
// Liefert nach Datum [{ task, slot, owner, key, status, due, end, completion, next, termKey, deferred }].
export function nextRounds(tasks, ctx, me, todayStr, doneById, days = 7) {
  const today = toDay(todayStr);
  const swap = nextSwap(ctx, todayStr);
  const out = [];
  for (const task of tasks) {
    if (kindOf(task) === 'daily') continue;
    const seen = new Set();
    const list = windowsBetween(task, ctx, fromDay(today + 1), fromDay(today + days))
      .filter((w) => w.owner === me && w.start > todayStr && (!swap || w.start < swap))
      .sort((a, b) => a.start.localeCompare(b.start));
    for (const w of list) {
      if (seen.has(w.slot)) continue;
      seen.add(w.slot);
      const c = doneById.get(completionId(task.id, w.key, w.slot)) || null;
      const off = w.deferred || paused(ctx, me, toDay(w.start), toDay(isRolling(task) ? w.start : w.end));
      if (off && !c) continue;
      out.push({
        task, slot: w.slot, owner: me, key: w.key, status: c ? 'done' : 'upcoming', due: w.start, end: w.end,
        completion: c, next: null, termKey: w.key, deferred: false,
      });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

// ---------- Fortschritt & Serie ----------

// Aufgaben mit Termin im Bereich [fromStr, toStr], für die `me` zuständig ist (eigene und gemeinsame).
// Was jemand anderer erledigt hat, fällt heraus; Pausiertes ebenso, solange es nicht erledigt ist.
// Liefert [{ task, slot, owner, key, start, end, done }]; done = eigene Erledigung oder null.
export function dueBetween(tasks, ctx, fromStr, toStr, doneById, me) {
  const out = [];
  for (const task of tasks) {
    for (const w of windowsBetween(task, ctx, fromStr, toStr)) {
      if (w.start < fromStr || (w.owner !== me && w.owner !== null)) continue;
      const c = doneById.get(completionId(task.id, w.key, w.slot)) || null;
      if (c && c.by !== me) continue;
      if (!c && w.deferred) continue; // mit Joker verschoben: zählt erst, wenn erledigt
      if (!c && paused(ctx, w.owner, toDay(w.start), toDay(w.end))) continue;
      out.push({ ...w, done: c });
    }
  }
  return out;
}

// ---------- Personen ----------

// Voll: Alle Personen stehen beim Anlegen fest, voll ist der Haushalt also erst, wenn jede schon auf einem Gerät war (seen_<id>).
export const householdFull = (ctx) => ctx.persons.every((p) => !!ctx[`seen_${p.id}`]);

// ---------- Personenfarben ----------

// Reihenfolge nach Farbverlauf, Vorschlag je Person möglichst weit auseinander
export const PALETTE = ['koralle', 'orange', 'senf', 'gruen', 'tuerkis', 'blau', 'violett', 'rosa'];
export const COLOR_SUGGESTIONS = ['koralle', 'tuerkis', 'violett', 'senf', 'blau', 'gruen'];
const COLOR_NAMES = {
  koralle: ['Koralle', 'Krabbe'], orange: ['Orange', 'Fuchs'], senf: ['Senf', 'Biene'], gruen: ['Grün', 'Frosch'],
  tuerkis: ['Türkis', 'Schildkröte'], blau: ['Blau', 'Wal'], violett: ['Violett', 'Oktopus'], rosa: ['Rosa', 'Flamingo'],
};
export const colorName = (c) => COLOR_NAMES[c]?.[0] ?? '';
export const colorLabel = (c) => (COLOR_NAMES[c] ? `${COLOR_NAMES[c][0]} (${COLOR_NAMES[c][1]})` : '');
const OLD_COLORS = { gelb: 'senf', gold: 'senf', rot: 'koralle' };

// Erster Vorschlag, der noch frei ist
export function suggestColor(taken) {
  return [...COLOR_SUGGESTIONS, ...PALETTE].find((c) => !taken.includes(c));
}

// Bestehende Haushalte: alte Farben auf die ähnlichste neue, keine doppelten. Wird nur beim Lesen umgerechnet,
// in der Datenbank ändert sich nichts. Ohne Änderung kommt dieselbe Liste zurück.
export function migrateColors(persons) {
  const keep = new Map();
  persons.forEach((p, i) => { if (PALETTE.includes(p.color) && !keep.has(p.color)) keep.set(p.color, i); });
  if (keep.size === persons.length) return persons;
  const used = [...keep.keys()];
  return persons.map((p, i) => {
    if (keep.get(p.color) === i) return p;
    const wish = OLD_COLORS[p.color];
    const color = wish && !used.includes(wish) ? wish : suggestColor(used);
    used.push(color);
    return { ...p, color };
  });
}

// ---------- Meine Haushalte (nur auf diesem Gerät) ----------

// Eintrag { code, names, me, setup } aktualisieren; Reihenfolge bleibt, neue kommen nach vorne.
// Liefert dieselbe Liste, wenn sich nichts geändert hat.
export function upsertHome(list, entry) {
  const i = list.findIndex((h) => h.code === entry.code);
  if (i < 0) return [entry, ...list];
  if (JSON.stringify(list[i]) === JSON.stringify(entry)) return list;
  return list.map((h, k) => (k === i ? entry : h));
}

// ---------- Gemeinsames Ziel ----------

export const goalOf = (ctx) => ({ percent: 90, reward: '', ...ctx.goal });

// Monat 'YYYY-MM': alle Termine des Monats beider Personen, ohne Tägliches und Abmachungen. Pausiertes fällt raus,
// solange es nicht erledigt ist. Liefert { total, done, percent, lastEnd }; percent abgerundet, lastEnd = letzte Frist.
export function goalStats(tasks, ctx, month, doneById) {
  const [y, m] = month.split('-').map(Number);
  const from = fromDay(dayOf(y, m, 1)), to = fromDay(dayOf(y, m + 1, 1) - 1);
  let total = 0, done = 0, lastEnd = '';
  for (const task of tasks) {
    if (kindOf(task) === 'daily') continue;
    for (const w of windowsBetween(task, ctx, from, to)) {
      // Mit Joker Verschobenes zählt erst, wenn erledigt, und im Monat seiner neuen Frist
      const anchor = w.deferred ? w.end : w.start;
      if (anchor < from || anchor > to) continue;
      const hit = doneById.has(completionId(task.id, w.key, w.slot));
      if (!hit && w.deferred) continue;
      if (!hit && paused(ctx, w.owner, toDay(w.start), toDay(w.end))) continue;
      total++;
      if (hit) done++;
      if (w.end > lastEnd) lastEnd = w.end;
    }
  }
  return { total, done, percent: total ? Math.floor((done * 100) / total) : 0, lastEnd };
}

// Ergebnis des Vormonats: reached, sobald die Quote stimmt; settled, wenn die letzte Frist vorbei ist.
// Der Startmonat zählt nur mit mindestens 14 Tagen Laufzeit (wie beim Tausch), sonst null.
export function goalResult(tasks, ctx, todayStr, doneById) {
  const prevDay = monthStart(monthIndex(toDay(todayStr))) - 1;
  const month = fromDay(prevDay).slice(0, 7);
  if (prevDay - toDay(ctx.setup) < 13) return null;
  const s = goalStats(tasks, ctx, month, doneById);
  if (!s.total) return null;
  return { month, ...s, reached: s.done * 100 >= goalOf(ctx).percent * s.total, settled: todayStr > s.lastEnd };
}

// Rückgängig: Monate mit erreichtem Ziel, die der Haken vom Tag `day` betreffen kann und jetzt nicht mehr reichen.
// Ohne Änderung kommt dieselbe Liste zurück. Monate vor einem neu eingerichteten Plan bleiben.
export function revokeGoalHits(hits, tasks, ctx, day, doneById) {
  const index = (s) => { const [y, m] = s.split('-').map(Number); return y * 12 + m; };
  const percent = goalOf(ctx).percent;
  const stale = Object.keys(hits).filter((month) => {
    if (Math.abs(index(month) - index(day)) > 1) return false;
    const [y, m] = month.split('-').map(Number);
    if (dayOf(y, m + 1, 1) - 1 - toDay(ctx.setup) < 13) return false;
    const s = goalStats(tasks, ctx, month, doneById);
    return s.total > 0 && s.done * 100 < percent * s.total;
  });
  return stale.length ? Object.fromEntries(Object.entries(hits).filter(([month]) => !stale.includes(month))) : hits;
}

// Rückgängig: Meilensteine, die auf dieser Art von Haken beruhen. Was vor dem Tag des Hakens erreicht wurde, hing nicht
// an ihm; so bleibt auch Erreichtes aus einem früheren Plan. now = was laut Daten gerade stimmt, longest = gerechnete Serie.
const MILESTONE_BASIS = { rule: ['extra100', 'joker'], task: ['first', 'week', 'week4', 'month', 'tasks100', 'goal'] };
export function revokeStats(st, undone, { now, longest, started, setup }) {
  const stale = MILESTONE_BASIS[undone.rule ? 'rule' : 'task'].filter((id) => st.done[id] >= undone.day && !now[id]);
  const series = stale.includes('week') || stale.includes('week4') || st.longestDay >= undone.day;
  const lower = series && longest < st.longest;
  const unstart = !undone.rule && st.start === setup && !started;
  if (!stale.length && !lower && !unstart) return st;
  return {
    ...st,
    done: Object.fromEntries(Object.entries(st.done).filter(([id]) => !stale.includes(id))),
    longest: lower ? longest : st.longest,
    start: unstart ? null : st.start,
  };
}

// Serie in Wochen: eigene Woche ab dem Putztag, zählt, wenn alle eigenen Termine darin erledigt sind.
// Ohne Termine (auch Abwesenheit und Joker) unterbricht sie nicht und zählt nicht; solange eine Frist läuft ebenso.
// fromStr: ab hier sind Erledigungen geladen, vorher wird nicht geurteilt. Liefert { current, longest }.
export function weekStreaks(tasks, ctx, me, doneById, fromStr, todayStr) {
  const days = ctx.persons.find((p) => p.id === me)?.days;
  const partial = fromStr > ctx.setup;
  const startDay = partial ? fromStr : ctx.setup;
  let a = toDay(personalWeek(days, startDay)[0]);
  if (partial && fromDay(a) < fromStr) a += 7;
  let current = 0, longest = 0;
  for (const today = toDay(todayStr); a <= today; a += 7) {
    const list = dueBetween(tasks, ctx, fromDay(a), fromDay(a + 6), doneById, me).filter((w) => kindOf(w.task) !== 'daily');
    if (!list.length) continue;
    const open = list.filter((w) => !w.done);
    if (!open.length) {
      current++;
      if (current > longest) longest = current;
    } else if (open.every((w) => w.end < todayStr)) current = 0;
  }
  return { current, longest };
}
