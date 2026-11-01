import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE, TEMPLATE_RULES, suggestTasks, suggestRules, OUR_TASKS, OUR_RULES, AREAS, QUESTIONS } from '../js/template.js';
import {
  toDay, fromDay, isoWeek, kindOf, evaluate, completionId, relevantKeys,
  packageOwners, rotationBase, swapCount, nextSwap, ownerNow, inSeason, windowsBetween, awayDuring,
  timesPerMonth, monthlyMinutes, loadByPerson, autoSplit, spreadPositions, slackOf, holidays, dueBetween, weekStreaks,
  personalWeek, isPressing, goalOf, goalStats, goalResult,
  jokerOf, jokerTick, canJoker, useJoker, JOKER_PRICE, JOKER_MAX, PACKAGES, isPackage, swapsByRound, upsertHome,
  nextRounds, migrateColors, suggestColor, PALETTE, revokeGoalHits, revokeStats, householdFull, colorName, colorLabel, urgency, pauseDuring, currentPause, setPause, endPause, pausedItem, changeAway, moveRange,
} from '../js/logic.js';

// 28.10.2026 ist ein Mittwoch; Putztag Standard Samstag (31.10., 7.11., 14.11. …)
const ctx = (over = {}) => ({
  setup: '2026-10-28',
  persons: [{ id: 'p1', name: 'Anna' }, { id: 'p2', name: 'Ben' }],
  swapped: false,
  ...over,
});
const task = (over = {}) => ({ id: 't', title: 'T', n: 1, unit: 'week', assign: 'shared', season: null, created: '2026-10-28', ...over });
const one = (t, c, today, done = []) => {
  const m = new Map(done.map(([key, slot]) => [completionId(t.id, key, slot), { by: 'p1' }]));
  return evaluate(t, c, today, m)[0];
};
const st = (t, c, today, done) => { const i = one(t, c, today, done); return [i.status, i.due, i.end]; };

test('Datumsumrechnung ist stabil', () => {
  assert.equal(fromDay(toDay('2026-03-29')), '2026-03-29'); // Sommerzeit-Umstellung
  assert.equal(fromDay(toDay('2024-02-29') + 1), '2024-03-01');
});

test('ISO-Kalenderwoche inkl. KW 53 und Jahreswechsel', () => {
  assert.deepEqual(isoWeek(toDay('2026-12-31')), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek(toDay('2027-01-03')), { year: 2026, week: 53 });
  assert.deepEqual(isoWeek(toDay('2027-01-04')), { year: 2027, week: 1 });
  assert.deepEqual(isoWeek(toDay('2025-12-29')), { year: 2026, week: 1 });
  assert.deepEqual(isoWeek(toDay('2026-01-01')), { year: 2026, week: 1 });
});

test('Intervall-Arten werden erkannt', () => {
  assert.equal(kindOf({ n: 1, unit: 'day' }), 'daily');
  assert.equal(kindOf({ n: 2, unit: 'week' }), 'biweekly');
  assert.equal(kindOf({ n: 6, unit: 'month' }), 'halfyear');
  assert.equal(kindOf({ n: 10, unit: 'day' }), 'custom');
});

test('überfällig erscheint nur einmal, verpasste Durchgänge stapeln sich nicht', () => {
  const t = task({ created: '2026-11-01' });
  // Termin 7.11. nicht erledigt → ab dem nächsten Termin 14.11. überfällig
  assert.equal(one(t, ctx(), '2026-11-13').status, 'due');
  const o = one(t, ctx(), '2026-11-14');
  assert.equal(o.status, 'overdue');
  assert.equal(o.key, 'weekly:2026-11-09');
  // nach mehreren verpassten Wochen trotzdem genau ein Element
  const items = evaluate(t, ctx(), '2026-12-15', new Map());
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'overdue');
  // Abhaken (für den laufenden Termin 12.12.) → erledigt, der nächste lässt sich schon vorziehen
  assert.equal(one(t, ctx(), '2026-12-13', [['weekly:2026-12-07', null]]).status, 'done');
  assert.equal(one(t, ctx(), '2026-12-15', [['weekly:2026-12-07', null]]).status, 'upcoming');
});

test('täglich: gestern verpasst verfällt, heute einfach fällig', () => {
  const t = task({ n: 1, unit: 'day', created: '2026-12-30' });
  assert.equal(one(t, ctx(), '2026-12-30').status, 'due');
  const o = one(t, ctx(), '2027-01-01');
  assert.equal(o.status, 'due');
  assert.equal(o.key, 'daily:2027-01-01');
});

test('alle 2 Wochen: gezählt ab der Einrichtungswoche, über den Jahreswechsel', () => {
  const t = task({ n: 2 });
  assert.equal(one(t, ctx(), '2026-10-28').key, 'biweekly:2026-10-26');
  assert.equal(one(t, ctx(), '2026-11-13').key, 'biweekly:2026-10-26'); // Termin 31.10., läuft bis zum nächsten
  assert.equal(one(t, ctx(), '2026-11-14').key, 'biweekly:2026-11-09');
  // 26.10. + 5×14 Tage = 4.1.2027, Termin 9.1.
  assert.equal(one(t, ctx(), '2027-01-08').key, 'biweekly:2026-12-21');
  assert.equal(one(t, ctx(), '2027-01-09').key, 'biweekly:2027-01-04');
});

test('täglich abwechselnd, auch über den Jahreswechsel', () => {
  const t = task({ n: 1, unit: 'day', assign: 'alternate' });
  const owners = ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']
    .map((d) => one(t, ctx({ setup: '2026-12-30' }), d, [[`daily:${fromDay(toDay(d) - 1)}`, null]]).owner);
  assert.deepEqual(owners, ['p1', 'p2', 'p1', 'p2']);
  assert.equal(one(t, ctx({ setup: '2026-12-30', swapped: true }), '2026-12-30', [['daily:2026-12-29', null]]).owner, 'p2');
});

test('außerhalb der Saison bleibt die Zuständigkeit erhalten', () => {
  const items = evaluate(task({ assign: 'each', season: { from: 11, to: 2 } }), ctx(), '2026-10-28', new Map());
  assert.deepEqual(items.map((i) => [i.status, i.owner]), [['offseason', 'p1'], ['offseason', 'p2']]);
  assert.equal(one(task({ assign: 'B', season: { from: 11, to: 2 } }), ctx(), '2026-10-28').owner, 'p2');
});

test('bei Bedarf: jeden Tag abhakbar, nie überfällig, nicht im Kalender', () => {
  const t = task({ n: 0, unit: 'need', assign: 'B' });
  assert.equal(kindOf(t), 'asneeded');
  const i = one(t, ctx(), '2026-11-05');
  assert.deepEqual([i.status, i.key, i.owner], ['need', 'need:2026-11-05', 'p2']);
  assert.equal(one(t, ctx(), '2026-11-05', [['need:2026-11-05', null]]).status, 'done');
  assert.equal(one(t, ctx(), '2026-11-06', [['need:2026-11-05', null]]).status, 'need');
  assert.deepEqual(windowsBetween(t, ctx(), '2026-11-01', '2026-11-30'), []);
  assert.ok(relevantKeys([t], ctx(), '2026-11-05').includes('need:2026-11-05'));
});

test('Aufwand pro Monat: Häufigkeit × Minuten, Saison anteilig, bei Bedarf geschätzt', () => {
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);
  near(timesPerMonth(task({ n: 1, unit: 'day' })), 30);
  near(timesPerMonth(task({ n: 1, unit: 'week' })), 4.3);
  near(timesPerMonth(task({ n: 2, unit: 'week' })), 2.2);
  near(timesPerMonth(task({ n: 3, unit: 'month' })), 1 / 3);
  near(timesPerMonth(task({ n: 12, unit: 'month' })), 1 / 12);
  near(timesPerMonth(task({ n: 0, unit: 'need', perMonth: 8 })), 8);
  near(timesPerMonth(task({ n: 1, unit: 'month', season: { from: 11, to: 1 } })), 3 / 12);
  near(monthlyMinutes(task({ n: 1, unit: 'week', min: 30 })), 129);
  near(monthlyMinutes(task({ n: 1, unit: 'week' })), 0);
});

test('Faire Aufteilung: je Intervall ausgeglichen, Gemeinsames zählt halb, Pakete fix', () => {
  const w = (min, assign = 'A') => task({ n: 1, unit: 'week', min, assign });
  const q = (min) => task({ n: 3, unit: 'month', min, assign: 'A' });
  const split = autoSplit([w(60), w(30), w(20), w(10), w(5), q(90), q(30), w(40, 'shared')]);
  // wöchentlich: gleich viele Aufgaben (±1), Minuten möglichst gleich
  const weekly = split.slice(0, 5).map((t) => t.assign);
  assert.equal(weekly.filter((a) => a === 'A').length >= 2 && weekly.filter((a) => a === 'B').length >= 2, true);
  assert.notEqual(split[5].assign, split[6].assign); // vierteljährlich: je eine Aufgabe
  assert.equal(split[7].assign, 'shared');
  const load = loadByPerson(split, ctx());
  assert.ok(Math.abs(load.p1 - load.p2) < 60, `${load.p1} vs ${load.p2}`);
  assert.deepEqual(packageOwners(ctx()), ['p1', 'p2']);
  assert.deepEqual(packageOwners(ctx({ swapped: true })), ['p2', 'p1']);
});

test('wöchentlich: ab dem Putztag dran bis zum Tag vor dem nächsten, dann vergessen', () => {
  const t = task({ assign: 'A' });
  assert.deepEqual(st(t, ctx(), '2026-10-29'), ['upcoming', '2026-10-31', '2026-11-06']);
  assert.deepEqual(st(t, ctx(), '2026-10-31'), ['due', '2026-10-31', '2026-11-06']);
  // Freitag: neue Kalenderwoche, aber die Zeit läuft noch
  const fr = one(t, ctx(), '2026-11-06');
  assert.deepEqual([fr.status, fr.key], ['due', 'weekly:2026-10-26']);
  const sa = one(t, ctx(), '2026-11-07');
  assert.deepEqual([sa.status, sa.end, sa.key], ['overdue', '2026-11-06', 'weekly:2026-11-02']);
  assert.deepEqual(st(t, ctx(), '2026-11-03', [['weekly:2026-10-26', null]]), ['upcoming', '2026-11-07', '2026-11-13']);
});

test('vergessen erscheint nur einmal, verpasste Wochen stapeln sich nicht', () => {
  const t = task({ assign: 'A' });
  assert.equal(one(t, ctx(), '2026-11-24').status, 'overdue');
  assert.equal(evaluate(t, ctx(), '2026-11-24', new Map()).length, 1);
  // rot ist immer der zuletzt verpasste Termin
  assert.deepEqual(st(t, ctx(), '2026-11-24'), ['overdue', '2026-11-14', '2026-11-20']);
});

test('mehrere Putztage: wöchentlich wählt pos den Tag in der Woche', () => {
  const c = ctx({ setup: '2026-11-02', persons: [{ id: 'p1', days: [5, 2] }, { id: 'p2' }] }); // Mi und Sa
  assert.equal(one(task({ assign: 'A', pos: 0 }), c, '2026-11-02').due, '2026-11-04');
  assert.equal(one(task({ assign: 'A', pos: 1 }), c, '2026-11-02').due, '2026-11-07');
  assert.equal(one(task({ assign: 'A', pos: 2 }), c, '2026-11-02').due, '2026-11-04');
});

test('Putztage je Person: Paket B an den Tagen von Person 2', () => {
  const c = ctx({ persons: [{ id: 'p1', days: [5] }, { id: 'p2', days: [2] }] });
  const t = task({ n: 1, unit: 'month', assign: 'B', pos: 1 }); // 2. Putztag im Monat
  const nov = one(t, c, '2026-11-02');
  assert.deepEqual([nov.owner, nov.due, nov.end], ['p2', '2026-11-11', '2026-11-16']);
  const dec = one(t, c, '2026-12-01', [['monthly:2026-11-01', null]]);
  assert.deepEqual([dec.owner, dec.due], ['p2', '2026-12-09']); // bleibt bei p2 (kein Pakettausch)
  assert.equal(one(t, c, '2026-11-17').status, 'overdue');
});

test('Start des Plans: Termine davor zählen nicht', () => {
  const t = task({ n: 1, unit: 'month', assign: 'A', pos: 3, created: '2026-10-01' }); // 4. Samstag = 24.10.
  const i = one(t, ctx(), '2026-10-29');
  assert.deepEqual([i.status, i.next], ['idle', '2026-11-28']);
  assert.equal(one(task({ assign: 'A' }), ctx({ setup: '2026-11-01' }), '2026-11-02').due, '2026-11-07');
});

test('Gemeinsames am gemeinsamen Putztag, fester Tag geht vor', () => {
  assert.equal(one(task(), ctx({ sharedDays: [6] }), '2026-10-29').due, '2026-11-01'); // Sonntag
  assert.equal(one(task({ assign: 'A', day: 1 }), ctx(), '2026-11-02').due, '2026-11-03'); // fester Dienstag
});

test('alle 2 Wochen: Block ab der Startwoche, pos = Woche, Zeit bis zum nächsten Termin', () => {
  const t = (pos) => task({ n: 2, unit: 'week', assign: 'A', pos });
  assert.deepEqual(st(t(0), ctx(), '2026-10-29'), ['upcoming', '2026-10-31', '2026-11-13']);
  assert.deepEqual(st(t(1), ctx(), '2026-10-29'), ['upcoming', '2026-11-07', '2026-11-20']);
  assert.equal(one(t(0), ctx(), '2026-11-10', [['biweekly:2026-10-26', null]]).due, '2026-11-14'); // nächster Block
});

test('Monat, Quartal, Halbjahr, Jahr: Kalenderperioden, Spielraum 5 bzw. 14 Tage', () => {
  assert.equal(slackOf(task({ n: 1, unit: 'month' })), 5);
  assert.equal(slackOf(task({ n: 3, unit: 'month' })), 14);
  assert.equal(slackOf(task({ n: 1, unit: 'day' })), 0);
  const h = task({ n: 6, unit: 'month' });
  assert.deepEqual([one(h, ctx(), '2026-10-29').status, one(h, ctx(), '2026-10-29').next], ['idle', '2027-01-02']);
  assert.equal(one(task({ n: 6, unit: 'month', pos: 2, created: '2026-07-01' }), ctx({ setup: '2026-07-01' }), '2026-07-02').due, '2026-07-18');
  const y = one(task({ n: 12, unit: 'month', pos: 0 }), ctx({ setup: '2026-01-01' }), '2027-01-10');
  assert.deepEqual([y.status, y.due, y.end], ['due', '2027-01-02', '2027-01-16']);
});

test('Vorlage verteilt Termine je Intervall und Zuteilung', () => {
  const tasks = spreadPositions([
    ...Array.from({ length: 4 }, () => task({ n: 1, unit: 'month', assign: 'A' })),
    ...Array.from({ length: 12 }, () => task({ n: 6, unit: 'month' })),
    task({ assign: 'A' }), task({ assign: 'A' }), task({ n: 1, unit: 'day' }),
  ]);
  assert.deepEqual(tasks.slice(0, 4).map((t) => t.pos), [0, 1, 2, 3]);
  assert.deepEqual(tasks.slice(4, 16).map((t) => t.pos), [0, 2, 4, 6, 8, 10, 13, 15, 17, 19, 21, 23]);
  assert.deepEqual(tasks.slice(16, 18).map((t) => t.pos), [0, 1]);
  assert.equal(tasks[18].pos, undefined);
});

test('wöchentlich über den Jahreswechsel (KW 53)', () => {
  const i = one(task({ assign: 'A' }), ctx(), '2026-12-31', [['weekly:2026-12-21', null]]);
  assert.deepEqual([i.due, i.key], ['2027-01-02', 'weekly:2026-12-28']);
});

test('pro Person: jede Person hat einen eigenen Eintrag an ihren Tagen', () => {
  const c = ctx({ persons: [{ id: 'p1', days: [5] }, { id: 'p2', days: [6] }] });
  const items = evaluate(task({ assign: 'each' }), c, '2026-10-29', new Map());
  assert.deepEqual(items.map((i) => [i.owner, i.due]), [['p1', '2026-10-31'], ['p2', '2026-11-01']]);
});

test('Saison: nur Putztage in der Saison zählen', () => {
  assert.ok(inSeason({ from: 11, to: 2 }, 1));
  assert.ok(!inSeason({ from: 11, to: 2 }, 3));
  const t = task({ assign: 'A', season: { from: 3, to: 10 } });
  assert.equal(one(t, ctx(), '2026-10-29').due, '2026-10-31');
  assert.equal(one(t, ctx(), '2026-11-04').status, 'offseason');
  // Quartal mit Saison: erster Putztag in der Saison
  const q = task({ n: 3, unit: 'month', assign: 'A', season: { from: 3, to: 10 }, created: '2026-01-01' });
  assert.equal(one(q, ctx({ setup: '2026-01-01' }), '2026-03-02').due, '2026-03-07');
});

test('Tagesintervalle zählen ab dem Start, Monatsintervalle ab dem Startmonat', () => {
  const t = task({ n: 10, unit: 'day', created: '2026-10-28' });
  assert.equal(one(t, ctx(), '2026-11-08', [['10d:2026-10-28', null]]).due, '2026-11-07');
  assert.equal(one(t, ctx(), '2026-11-08').status, 'overdue'); // 28.10. verpasst
  const m = task({ n: 2, unit: 'month', assign: 'A' }); // Perioden Okt–Nov, Dez–Jan; 1. Putztag 3.10. liegt vor dem Start
  assert.deepEqual([one(m, ctx(), '2026-11-02').status, one(m, ctx(), '2026-11-02').next], ['idle', '2026-12-05']);
});

test('relevante Schlüssel und Kalender', () => {
  const t = task({ assign: 'A' });
  assert.deepEqual(relevantKeys([t], ctx(), '2026-11-04'), ['weekly:2026-10-19', 'weekly:2026-10-26', 'weekly:2026-11-02', 'weekly:2026-11-09']);
  const w = windowsBetween(t, ctx(), '2026-11-01', '2026-11-15');
  assert.deepEqual(w.map((x) => [x.start, x.end, x.owner]), [
    ['2026-10-31', '2026-11-06', 'p1'], ['2026-11-07', '2026-11-13', 'p1'], ['2026-11-14', '2026-11-20', 'p1'],
  ]);
});

test('Abwesenheit pausiert: verpasst während Urlaub → nicht vergessen', () => {
  const t = task({ assign: 'A' });
  const away = { p1: { from: '2026-10-30', to: '2026-11-02' } };
  assert.equal(one(t, ctx(), '2026-11-08').status, 'overdue');
  assert.equal(one(t, ctx({ away }), '2026-11-08').status, 'due');
});

test('Feiertage Österreich inkl. Ostern', () => {
  const h = holidays(2026);
  assert.equal(h.get('2026-04-06'), 'Ostermontag');
  assert.equal(h.get('2026-05-14'), 'Christi Himmelfahrt');
  assert.equal(h.get('2026-05-25'), 'Pfingstmontag');
  assert.equal(h.get('2026-06-04'), 'Fronleichnam');
  assert.equal(h.get('2026-10-26'), 'Nationalfeiertag');
  assert.equal(holidays(2027).get('2027-03-29'), 'Ostermontag');
});

test('dueBetween: eigene und gemeinsame im Bereich, fremd Erledigtes fällt heraus', () => {
  const ctx = { setup: '2026-10-05', persons: [{ id: 'p1', days: [5] }, { id: 'p2', days: [5] }], sharedDays: [5] };
  const mk = (id, assign) => ({ id, n: 1, unit: 'week', assign, created: '2026-10-05' });
  const tasks = [mk('a', 'A'), mk('b', 'B'), mk('s', 'shared'), mk('t', 'shared')];
  const key = 'weekly:2026-11-09';
  const done = new Map([
    [completionId('a', key, null), { by: 'p1' }],
    [completionId('t', key, null), { by: 'p2' }],
  ]);
  const list = dueBetween(tasks, ctx, '2026-11-09', '2026-11-15', done, 'p1');
  assert.deepEqual(list.map((w) => [w.task.id, !!w.done]), [['a', true], ['s', false]]);
});

test('dueBetween: Pausiertes zählt nicht, Termine außerhalb auch nicht', () => {
  const ctx = { setup: '2026-10-05', persons: [{ id: 'p1', days: [5] }, { id: 'p2', days: [5] }], sharedDays: [5],
    away: { p1: { from: '2026-11-09', to: '2026-11-20' } } };
  const tasks = [{ id: 'a', n: 1, unit: 'week', assign: 'A', created: '2026-10-05' }];
  assert.equal(dueBetween(tasks, ctx, '2026-11-09', '2026-11-15', new Map(), 'p1').length, 0);
  assert.equal(dueBetween(tasks, { ...ctx, away: {} }, '2026-11-09', '2026-11-13', new Map(), 'p1').length, 0);
});

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('Saison mit zwei Zeiträumen: Frühling und Herbst, Termine nur dort', () => {
  const season = { from: 3, to: 5, from2: 9, to2: 11 };
  assert.ok(inSeason(season, 4));
  assert.ok(inSeason(season, 10));
  assert.ok(!inSeason(season, 1));
  assert.ok(!inSeason(season, 7));
  const t = task({ n: 6, unit: 'month', season, created: '2026-01-01' });
  const c = ctx({ setup: '2027-01-01' });
  const months = windowsBetween(t, c, '2027-01-01', '2028-12-31').map((w) => +w.start.slice(5, 7));
  assert.deepEqual(months, [3, 9, 3, 9]);
  assert.equal(one(t, c, '2027-01-15').status, 'offseason');
  near(timesPerMonth(t), 2 / 12);
});

test('Saison kürzt seltene Aufgaben nicht: jährlich bleibt 1× pro Jahr, monatlich anteilig', () => {
  near(timesPerMonth(task({ n: 12, unit: 'month', season: { from: 3, to: 5 } })), 1 / 12);
  near(timesPerMonth(task({ n: 1, unit: 'month', season: { from: 3, to: 10 } })), 8 / 12);
  near(timesPerMonth(task({ n: 3, unit: 'month', season: { from: 3, to: 5 } })), 2 / 12);
  near(timesPerMonth(task({ n: 1, unit: 'week', season: { from: 10, to: 11 } })), 4.3 * 2 / 12);
});

test('Aufteilung nach Zeit: beide fast gleich viel, Wöchentliches so gleich wie möglich', () => {
  const load = loadByPerson(autoSplit(OUR_TASKS), ctx());
  const week = (x) => x / 4.3 / 60;
  assert.ok(Math.abs(week(load.p1) - week(load.p2)) < 0.1, `${week(load.p1)} vs ${week(load.p2)}`);
  const weekly = autoSplit(OUR_TASKS).filter((t) => t.n === 1 && t.unit === 'week');
  const sum = (a) => weekly.filter((t) => t.assign === a).reduce((s, t) => s + t.min, 0);
  assert.equal(Math.abs(sum('A') - sum('B')), 30); // Wäsche 90 gegen 60
});

test('Vorlage: vollständig, Kern und unser Plan passen', () => {
  const areas = AREAS.map((a) => a[0]);
  for (const t of TEMPLATE) {
    assert.ok(areas.includes(t.area), t.title);
    assert.ok(t.min > 0, t.title);
    if (t.unit === 'need') assert.ok(t.perMonth > 0, t.title);
  }
  assert.equal(new Set(TEMPLATE.map((t) => t.title)).size, TEMPLATE.length);
  const ctx2 = ctx();
  const hoursPerWeek = (list) => Object.values(loadByPerson(list, ctx2)).reduce((a, b) => a + b, 0) / 4.3 / 60;
  assert.ok(Math.abs(hoursPerWeek(OUR_TASKS) - 4.4) < 0.1, `${hoursPerWeek(OUR_TASKS)}`);
  const titles = OUR_TASKS.map((t) => t.title);
  assert.ok(!titles.some((x) => x.startsWith('Garten') || x.startsWith('Haustier') || x.includes('Balkon')));
  assert.ok(titles.includes('Loggia kehren') && titles.includes('Wäsche inkl. Bügeln') && titles.includes('Kind: Kindersitz waschen'));
  const bett = OUR_TASKS.find((t) => t.title === 'Bett neu beziehen');
  assert.deepEqual([bett.n, bett.unit], [1, 'month']);
  assert.ok(!OUR_RULES.includes('Haustier: Näpfe reinigen') && OUR_RULES.includes('Pflanzen gießen bei Hitze'));
  assert.equal(TEMPLATE_RULES.length, 10);
});

test('Vorschlag: ohne Antworten nur der Kern, Antworten wählen Passendes vor', () => {
  const on = (answers) => suggestTasks(answers).filter((t) => t.on);
  assert.ok(on([]).every((t) => !t.when));
  assert.equal(on([]).length, 35);
  assert.equal(suggestTasks([]).length, TEMPLATE.length);
  assert.equal(suggestRules([]).length, 7);
  assert.ok(on(['kind']).some((t) => t.title === 'Kind: Kindersitz waschen'));
  assert.ok(suggestRules(['kind']).includes('Kind: Hochstuhl und Wickeltisch abwischen'));
  const pets = on(['haustier']).filter((t) => t.area === 'tier').map((t) => t.title);
  assert.deepEqual(pets, ['Haustier: Schlafplatz waschen']); // Katzenklo, Käfig nur angeboten
  const washing = on(['buegeln']).find((t) => t.title.startsWith('Wäsche'));
  assert.deepEqual([washing.title, washing.min], ['Wäsche inkl. Bügeln', 90]);
  assert.equal(on(['buegeln']).length, 35); // Bügeln ist keine eigene Aufgabe
  assert.equal(TEMPLATE.find((t) => t.title === 'Wäsche').min, 60); // Vorlage bleibt unverändert
  const all = QUESTIONS.map((q) => q[0]);
  assert.equal(on(all).length, TEMPLATE.filter((t) => !t.soft).length);
});

// Tausch: Start 15.10.2026, erster Tausch am 1.11. (ab November)
const rot = (over = {}) => ctx({ setup: '2026-10-15', rotateFrom: '2026-10', ...over });
const rotTask = (over = {}) => task({ assign: 'A', created: '2026-10-15', ...over });

test('Tausch: ohne rotateFrom bleibt alles fix', () => {
  assert.equal(ownerNow(rotTask(), ctx({ setup: '2026-10-15' }), '2026-12-07'), 'p1');
  assert.equal(swapCount(ctx(), '2026-12-07'), 0);
  assert.equal(nextSwap(ctx(), '2026-12-07'), null);
});

test('Tausch: Beginn übersprungen, wenn der Start knapp vor dem Monatsersten liegt', () => {
  assert.equal(rotationBase('2026-10-31'), '2026-11');
  assert.equal(rotationBase('2026-10-19'), '2026-11'); // 13 Tage vor dem 1.11.
  assert.equal(rotationBase('2026-10-18'), '2026-10'); // genau 14 Tage
  assert.equal(rotationBase('2026-12-20'), '2027-01');
  assert.equal(nextSwap({ rotateFrom: rotationBase('2026-10-31') }, '2026-10-31'), '2026-12-01');
  assert.equal(nextSwap({ rotateFrom: '2026-11' }, '2026-12-01'), '2027-01-01');
  assert.equal(swapCount({ rotateFrom: '2026-11' }, '2026-11-20'), 0);
  assert.equal(swapCount({ rotateFrom: '2026-11' }, '2027-01-02'), 2);
});

test('Tausch: Pakete tauschen monatlich, bei mehr Personen reihum', () => {
  const m = rotTask({ n: 1, unit: 'month' });
  assert.deepEqual(['2026-10-20', '2026-11-20', '2026-12-20', '2027-01-20'].map((d) => ownerNow(m, rot(), d)), ['p1', 'p2', 'p1', 'p2']);
  assert.equal(ownerNow(rotTask({ n: 1, unit: 'month', assign: 'B' }), rot(), '2026-11-20'), 'p1');
  const three = { persons: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] };
  assert.deepEqual([0, 1, 2, 3].map((n) => packageOwners(three, n)), [['p1', 'p2', 'p3'], ['p2', 'p3', 'p1'], ['p3', 'p1', 'p2'], ['p1', 'p2', 'p3']]);
});

test('Tauschtag: wöchentlich zählt der Monat des Putztags, sonst der Beginn der Periode', () => {
  const w = rotTask();
  assert.equal(ownerNow(w, rot(), '2026-11-29'), 'p2'); // Termin 28.11.
  assert.equal(ownerNow(w, rot(), '2026-12-01'), 'p2'); // Termin 28.11. läuft noch
  assert.equal(ownerNow(w, rot(), '2026-12-04'), 'p2');
  assert.equal(ownerNow(w, rot(), '2026-12-05'), 'p1'); // erster Putztag im Dezember
  const q = rotTask({ n: 3, unit: 'month' });
  assert.deepEqual(['2026-10-20', '2026-12-31', '2027-01-05', '2027-04-05'].map((d) => ownerNow(q, rot(), d)), ['p1', 'p1', 'p2', 'p1']);
});

test('Tausch: verpasste Aufgabe bleibt bei der Person, die sie verpasst hat', () => {
  const w = rotTask();
  const it = one(w, rot(), '2026-12-08'); // Woche ab 30.11. (p2) nicht erledigt
  assert.equal(it.status, 'overdue');
  assert.equal(it.owner, 'p2');
  assert.equal(ownerNow(w, rot(), '2026-12-08'), 'p1');
});

test('Tausch: halbjährlich und jährlich wechseln je Durchgang', () => {
  const c = rot({ setup: '2026-10-15', rotateFrom: '2026-10' });
  const h = rotTask({ n: 6, unit: 'month' });
  assert.deepEqual(['2026-11-20', '2027-03-20', '2027-09-20', '2028-03-20'].map((d) => ownerNow(h, c, d)), ['p1', 'p2', 'p1', 'p2']);
  const y = rotTask({ n: 12, unit: 'month' });
  assert.deepEqual(['2026-11-20', '2027-03-20', '2027-11-20', '2028-02-20'].map((d) => ownerNow(y, c, d)), ['p1', 'p2', 'p2', 'p1']);
  const b = rotTask({ n: 6, unit: 'month', assign: 'B' });
  assert.equal(ownerNow(b, c, '2026-11-20'), 'p2'); // Paket B beginnt bei der anderen Person
});

test('Fix bei Person: tauscht nicht mit, zählt aber in die Zeit', () => {
  const f = rotTask({ fixed: true, assign: 'B', min: 30 });
  assert.deepEqual(['2026-10-20', '2026-11-20', '2026-12-20'].map((d) => ownerNow(f, rot(), d)), ['p2', 'p2', 'p2']);
  assert.ok(loadByPerson([f], rot()).p2 > 0);
  assert.equal(ownerNow(rotTask({ assign: 'shared' }), rot(), '2026-11-20'), null);
});

test('Vorlage: Seltenes mit Person, gemeinsam nur Ausmisten und Bei Bedarf', () => {
  const split = autoSplit(OUR_TASKS);
  const shared = split.filter((t) => t.assign === 'shared').map((t) => t.title).sort();
  assert.deepEqual(shared, ['Abflüsse reinigen', 'Ausmisten', 'Gefrierschrank abtauen', 'Mistkübel auswaschen']);
  const halves = split.filter((t) => t.n === 6 && t.unit === 'month');
  assert.ok(halves.some((t) => t.assign === 'A') && halves.some((t) => t.assign === 'B'));
});

// ---------- Persönliche Woche (Person p1 Montag, p2 Sonntag) ----------

const moSo = (over = {}) => ({
  setup: '2026-11-02', rotateFrom: '2026-11', swapped: false,
  persons: [{ id: 'p1', name: 'Mo', days: [0] }, { id: 'p2', name: 'So', days: [6] }],
  ...over,
});
const wk = (over = {}) => ({ id: 'w', title: 'W', n: 1, unit: 'week', assign: 'A', season: null, created: '2026-11-02', ...over });
const terms = (t, c, from, to) => windowsBetween(t, c, from, to).map((w) => [w.start, w.end, w.owner]);

test('persönliche Woche: beim Tausch Abstand 6 und 8 Tage, jede Person hat ihre Woche', () => {
  assert.deepEqual(terms(wk(), moSo(), '2026-11-23', '2027-01-11'), [
    ['2026-11-23', '2026-11-29', 'p1'],
    ['2026-11-30', '2026-12-05', 'p1'], // 6 Tage bis zum ersten Sonntag im Dezember
    ['2026-12-06', '2026-12-12', 'p2'],
    ['2026-12-13', '2026-12-19', 'p2'],
    ['2026-12-20', '2026-12-26', 'p2'],
    ['2026-12-27', '2027-01-03', 'p2'], // 8 Tage bis zum ersten Montag im Jänner
    ['2027-01-04', '2027-01-10', 'p1'],
    ['2027-01-11', '2027-01-17', 'p1'],
  ]);
});

test('persönliche Woche: zwei Termine in einer Kalenderwoche zählen getrennt', () => {
  const t = wk();
  const w = windowsBetween(t, moSo(), '2026-11-30', '2026-12-06');
  assert.deepEqual(w.map((x) => x.key), ['weekly:2026-11-30', 'weekly:2026-11-30b']);
  // Montag erledigt: der Sonntag der anderen Person bleibt offen
  const done = [['weekly:2026-11-30', null]];
  assert.deepEqual(st(t, moSo(), '2026-12-06', done), ['due', '2026-12-06', '2026-12-12']);
  assert.equal(one(t, moSo(), '2026-12-06', done).owner, 'p2');
  assert.equal(one(t, moSo(), '2026-12-06', [...done, ['weekly:2026-11-30b', null]]).status, 'done');
  assert.ok(relevantKeys([t], moSo(), '2026-12-06').includes('weekly:2026-11-30b'));
});

test('persönliche Woche: Vorziehen ab Montag der Kalenderwoche, zählt für den Termin', () => {
  const t = wk({ assign: 'B' }); // im November bei p2, Sonntag
  const c = moSo();
  assert.deepEqual(st(t, c, '2026-11-09', [['weekly:2026-11-02', null]]), ['upcoming', '2026-11-15', '2026-11-21']);
  const early = [['weekly:2026-11-02', null], ['weekly:2026-11-09', null]];
  assert.equal(one(t, c, '2026-11-10', early).status, 'done');
  assert.equal(one(t, c, '2026-11-15', early).status, 'done'); // am Termin nicht nochmal offen
  assert.equal(one(t, c, '2026-11-16', early).status, 'upcoming'); // erst die nächste Runde
  assert.equal(one(t, c, '2026-11-16', early).due, '2026-11-22');
});

test('persönliche Woche: heute Erledigtes bleibt heute erledigt, auch vor einem Termin in derselben Woche', () => {
  const t = wk();
  const m = new Map([[completionId(t.id, 'weekly:2026-11-30', null), { by: 'p1', day: '2026-11-30' }]]);
  const today = evaluate(t, moSo(), '2026-11-30', m)[0];
  assert.deepEqual([today.status, today.next], ['done', '2027-01-04']); // nächster eigener Termin, nicht der von p2
  const later = evaluate(t, moSo(), '2026-12-01', m)[0];
  assert.deepEqual([later.status, later.owner, later.key], ['upcoming', 'p2', 'weekly:2026-11-30b']);
});

test('persönliche Woche: verpasst wird am nächsten Termin rot, bei der Person, ein Haken für beide', () => {
  const t = wk();
  const late = one(t, moSo(), '2026-11-09');
  assert.deepEqual([late.status, late.owner, late.due, late.key], ['overdue', 'p1', '2026-11-02', 'weekly:2026-11-09']);
  assert.equal(one(t, moSo(), '2026-11-09', [['weekly:2026-11-09', null]]).status, 'done');
  // über den Tausch: Montag 30.11. verpasst → am Sonntag 6.12. rot bei p1
  const swap = one(t, moSo(), '2026-12-06', [['weekly:2026-11-23', null]]);
  assert.deepEqual([swap.status, swap.owner, swap.key], ['overdue', 'p1', 'weekly:2026-11-30b']);
});

test('persönliche Woche: bisherige Erledigungen bleiben gültig, nichts wird doppelt fällig', () => {
  // Erledigung aus der Zeit vor dem Umbau: gleicher Schlüssel wie bisher
  const t = wk({ assign: 'B', created: '2026-10-28' });
  const c = moSo({ setup: '2026-10-28', rotateFrom: null });
  const done = [['weekly:2026-11-02', null]];
  assert.equal(one(t, c, '2026-11-08', done).status, 'done');
  assert.equal(one(t, c, '2026-11-08', done).key, 'weekly:2026-11-02');
  // ohne Tausch nie ein zweiter Termin in der Woche
  assert.ok(windowsBetween(t, c, '2026-11-01', '2027-03-01').every((w) => !w.key.endsWith('b')));
});

test('persönliche Woche: ohne Tausch, Fix, gemeinsam und pro Person bleiben regelmäßig', () => {
  const gaps = (t, c) => {
    const w = windowsBetween(t, c, '2026-11-02', '2027-02-01');
    return new Set(w.slice(1).map((x, i) => toDay(x.start) - toDay(w[i].start)));
  };
  assert.deepEqual([...gaps(wk(), moSo({ rotateFrom: null }))], [7]);
  assert.deepEqual([...gaps(wk({ fixed: true }), moSo())], [7]);
  assert.deepEqual([...gaps(wk({ assign: 'shared' }), moSo({ sharedDays: [5] }))], [7]);
  const each = windowsBetween(wk({ assign: 'each' }), moSo(), '2026-11-09', '2026-11-15');
  assert.deepEqual(each.map((w) => [w.slot, w.start, w.end]), [['p1', '2026-11-09', '2026-11-15'], ['p2', '2026-11-08', '2026-11-14'], ['p2', '2026-11-15', '2026-11-21']]);
  // gleicher Putztag: beim Tausch keine Lücke
  const same = moSo({ persons: [{ id: 'p1', days: [5] }, { id: 'p2', days: [5] }] });
  assert.deepEqual([...gaps(wk(), same)], [7]);
});

test('alle 2 Wochen beim Tausch: ein Termin je Block, Abstand 20 und 8 Tage', () => {
  const b = wk({ id: 'b', n: 2 });
  assert.deepEqual(terms(b, moSo(), '2026-11-30', '2027-01-11'), [
    ['2026-11-30', '2026-12-19', 'p1'],
    ['2026-12-20', '2027-01-02', 'p2'],
    ['2027-01-03', '2027-01-10', 'p2'],
    ['2027-01-11', '2027-01-24', 'p1'],
  ]);
});

test('Saison: letzter Termin endet nach einer Runde, nicht erst beim nächsten Frühling', () => {
  const s = wk({ season: { from: 3, to: 10 }, created: '2026-03-01' });
  const c = moSo({ setup: '2026-03-01', rotateFrom: null });
  const last = windowsBetween(s, c, '2026-10-26', '2026-11-20').pop();
  assert.deepEqual([last.start, last.end], ['2026-10-26', '2026-11-01']);
  assert.equal(one(s, c, '2026-11-10').status, 'offseason');
});

test('Monatliches behält den Spielraum', () => {
  const m = wk({ id: 'm', n: 1, unit: 'month', pos: 0 });
  assert.deepEqual(terms(m, moSo(), '2026-12-01', '2026-12-10'), [['2026-12-06', '2026-12-11', 'p2']]);
});

test('eigene Woche und „drängt heute“', () => {
  assert.deepEqual(personalWeek([0], '2026-12-02'), ['2026-11-30', '2026-12-06']);
  assert.deepEqual(personalWeek([6], '2026-12-02'), ['2026-11-29', '2026-12-05']);
  assert.deepEqual(personalWeek([6], '2026-12-06'), ['2026-12-06', '2026-12-12']);
  assert.deepEqual(personalWeek([2, 5], '2026-12-01'), ['2026-11-25', '2026-12-01']); // Mi und Sa: ab Mi
  const t = wk();
  const on = (d) => isPressing(one(t, moSo(), d, [['weekly:2026-11-02', null]]), d);
  assert.equal(on('2026-11-09'), true); // Termin
  assert.equal(on('2026-11-10'), true); // Tag danach
  assert.equal(on('2026-11-11'), false); // bleibt in der Liste, drängt aber nicht
  assert.equal(isPressing(one(t, moSo(), '2026-11-16', [['weekly:2026-11-02', null]]), '2026-11-16'), true); // rot
  const m = wk({ n: 1, unit: 'month', pos: 0 });
  assert.equal(isPressing(one(m, moSo(), '2026-11-05'), '2026-11-05'), true); // Monatliches wie bisher
});

test('Ganzer Monat: zählt die Termine auf den Putztagen im Monat', () => {
  const tasks = [wk()];
  const dec = dueBetween(tasks, moSo(), '2026-12-01', '2026-12-31', new Map(), 'p2');
  assert.deepEqual(dec.map((w) => w.start), ['2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27']);
  assert.deepEqual(dueBetween(tasks, moSo(), '2026-12-01', '2026-12-31', new Map(), 'p1').map((w) => w.start), []);
  assert.deepEqual(dueBetween(tasks, moSo(), '2027-01-01', '2027-01-31', new Map(), 'p1').map((w) => w.start), ['2027-01-04', '2027-01-11', '2027-01-18', '2027-01-25']);
});

// ---------- Gemeinsames Ziel ----------

const doneAll = (tasks, c, month, skip = 0) => {
  const m = new Map();
  const [y, mo] = month.split('-').map(Number);
  const to = `${month}-${new Date(Date.UTC(y, mo, 0)).getUTCDate()}`;
  tasks.flatMap((t) => windowsBetween(t, c, `${month}-01`, to).filter((w) => w.start >= `${month}-01`))
    .slice(skip).forEach((w) => m.set(completionId(w.task.id, w.key, w.slot), { by: 'p1' }));
  return m;
};

test('Ziel: Standard 90 %, ohne Belohnung', () => {
  assert.deepEqual(goalOf({}), { percent: 90, reward: '' });
  assert.deepEqual(goalOf({ goal: { percent: 80, reward: 'Pizza-Abend' } }), { percent: 80, reward: 'Pizza-Abend' });
});

test('Ziel: zählt die Termine des ganzen Monats beider Personen, abgerundet', () => {
  const tasks = [wk(), wk({ id: 'b', assign: 'B' }), wk({ id: 's', assign: 'shared' })];
  const c = moSo({ sharedDays: [5] });
  // Dezember: p2 So 6./13./20./27., p1 Mo 7./14./21./28., gemeinsam Sa 5./12./19./26.
  assert.equal(goalStats(tasks, c, '2026-12', new Map()).total, 12);
  assert.deepEqual(goalStats(tasks, c, '2026-12', new Map()).percent, 0);
  const s = goalStats(tasks, c, '2026-12', doneAll(tasks, c, '2026-12', 1));
  assert.deepEqual([s.done, s.total, s.percent], [11, 12, 91]);
  assert.equal(s.lastEnd, '2027-01-03'); // Termin 27.12. läuft bis zum 4.1.
});

test('Ziel: Vertretung zählt, Tägliches und Bei Bedarf nicht, „pro Person“ doppelt', () => {
  const c = moSo();
  const m = new Map([[completionId('w', 'weekly:2026-11-30b', null), { by: 'p1', forPerson: 'p2' }]]);
  assert.equal(goalStats([wk()], c, '2026-12', m).done, 1);
  assert.equal(goalStats([wk({ n: 1, unit: 'day' })], c, '2026-12', new Map()).total, 0);
  assert.equal(goalStats([wk({ n: 0, unit: 'need' })], c, '2026-12', new Map()).total, 0);
  assert.equal(goalStats([wk({ assign: 'each' })], c, '2026-12', new Map()).total, 8);
});

test('Ziel: Abwesenheit fällt raus, außer es wurde trotzdem erledigt', () => {
  const t = wk({ fixed: true }); // immer p1, Mo 7./14./21./28.
  const c = moSo({ away: { p1: { from: '2026-12-14', to: '2026-12-16' } } });
  const free = goalStats([t], c, '2026-12', new Map());
  assert.equal(free.total, 3);
  const m = new Map([[completionId('w', 'weekly:2026-12-14', null), { by: 'p1' }]]);
  assert.deepEqual([goalStats([t], c, '2026-12', m).total, goalStats([t], c, '2026-12', m).done], [4, 1]);
});

test('Ziel: Ergebnis des Vormonats erst endgültig nach der letzten Frist', () => {
  const tasks = [wk()];
  const c = moSo();
  const open = goalResult(tasks, c, '2027-01-01', new Map());
  assert.deepEqual([open.month, open.reached, open.settled], ['2026-12', false, false]);
  assert.equal(goalResult(tasks, c, '2027-01-03', new Map()).settled, false); // p2 So 27.12. läuft bis 3.1.
  assert.equal(goalResult(tasks, c, '2027-01-04', new Map()).settled, true);
  const all = goalResult(tasks, c, '2027-01-01', doneAll(tasks, c, '2026-12'));
  assert.deepEqual([all.reached, all.settled], [true, false]); // schon erreicht, Frist läuft noch
});

test('Ziel: genau auf der Grenze zählt, knapp darunter nicht', () => {
  const tasks = Array.from({ length: 5 }, (_, i) => wk({ id: `t${i}`, fixed: true })); // 4 Termine je Aufgabe = 20
  const c = moSo({ goal: { percent: 90 } });
  assert.equal(goalResult(tasks, c, '2027-01-20', doneAll(tasks, c, '2026-12', 2)).reached, true); // 18 von 20
  assert.equal(goalResult(tasks, c, '2027-01-20', doneAll(tasks, c, '2026-12', 3)).reached, false); // 17 von 20
});

test('Ziel: Startmonat zählt nur mit mindestens 14 Tagen, keine Aufgaben = kein Ergebnis', () => {
  assert.equal(goalResult([wk({ created: '2026-10-31' })], moSo({ setup: '2026-10-31' }), '2026-11-01', new Map()), null);
  assert.equal(goalResult([wk({ created: '2026-10-19' })], moSo({ setup: '2026-10-19', rotateFrom: null }), '2026-11-01', new Map()), null); // 13 Tage
  assert.equal(goalResult([wk({ created: '2026-10-18' })], moSo({ setup: '2026-10-18', rotateFrom: null }), '2026-11-01', new Map()).month, '2026-10'); // 14 Tage
  assert.equal(goalResult([], moSo(), '2027-01-05', new Map()), null);
  assert.equal(goalResult([wk()], moSo(), '2026-10-05', new Map()), null); // vor dem Start
});

// ---------- Joker ----------

const withJoker = (c, id, ...termIds) => ({ ...c, [`joker_${id}`]: { ...jokerOf({}, id), deferred: Object.fromEntries(termIds.map((t) => [t, '2026-11-01'])) } });

test('Joker verdienen: 30 Abmachungen = 1, höchstens 3', () => {
  let j = jokerOf({}, 'p1');
  for (let i = 0; i < JOKER_PRICE - 1; i++) j = jokerTick(j, 1);
  assert.deepEqual([j.progress, j.count], [29, 0]);
  j = jokerTick(j, 1);
  assert.deepEqual([j.progress, j.count, j.earned], [0, 1, 1]);
  j = { ...j, count: JOKER_MAX, progress: 0 };
  assert.deepEqual(jokerTick(j, 1), j); // voll: zählt nicht weiter
});

test('Joker: Abmachung zurücknehmen rechnet zurück, nie unter 0', () => {
  let j = jokerTick({ ...jokerOf({}, 'p1'), progress: 29 }, 1);
  assert.equal(j.count, 1);
  j = jokerTick(j, -1);
  assert.deepEqual([j.progress, j.count, j.earned], [29, 0, 0]);
  assert.deepEqual(jokerTick(jokerOf({}, 'p1'), -1), jokerOf({}, 'p1'));
});

test('Joker wöchentlich: nicht rot, ein Eintrag bei der Person, ein Haken für beide Runden', () => {
  const t = wk();
  const c = withJoker(moSo(), 'p1', completionId('w', 'weekly:2026-11-02', null));
  // Ohne Joker wäre der 9.11. rot
  assert.equal(one(t, moSo(), '2026-11-09').status, 'overdue');
  const it = one(t, c, '2026-11-09');
  assert.deepEqual([it.status, it.owner, it.deferred, it.end, it.key], ['due', 'p1', true, '2026-11-15', 'weekly:2026-11-09']);
  assert.equal(evaluate(t, c, '2026-11-09', new Map()).length, 1);
  assert.equal(one(t, c, '2026-11-15').status, 'due');
  // Danach rot, wie jede verpasste Runde
  assert.equal(one(t, c, '2026-11-16').status, 'overdue');
  assert.equal(one(t, c, '2026-11-12', [['weekly:2026-11-09', null]]).status, 'done');
});

test('Joker über den Tausch: bleibt bei der Person, Haken deckt die Runde der anderen ab', () => {
  const t = wk();
  const c = withJoker(moSo(), 'p1', completionId('w', 'weekly:2026-11-30', null));
  const it = one(t, c, '2026-12-06', [['weekly:2026-11-23', null]]);
  assert.deepEqual([it.status, it.owner, it.key, it.deferred], ['due', 'p1', 'weekly:2026-11-30b', true]);
  assert.equal(one(t, c, '2026-12-06', [['weekly:2026-11-23', null], ['weekly:2026-11-30b', null]]).status, 'done');
});

test('Joker alle 2 Wochen und monatlich: Frist 7 Tage länger', () => {
  const b = wk({ id: 'b', n: 2 });
  const cb = withJoker(moSo({ rotateFrom: null }), 'p1', completionId('b', 'biweekly:2026-11-02', null));
  assert.equal(one(b, cb, '2026-11-20').end, '2026-11-22');
  assert.equal(one(b, cb, '2026-11-22').status, 'due');
  assert.equal(one(b, cb, '2026-11-23').status, 'overdue');
  const m = wk({ id: 'm', n: 1, unit: 'month', pos: 0 });
  const cm = withJoker(moSo({ rotateFrom: null }), 'p1', completionId('m', 'monthly:2026-11-01', null));
  assert.deepEqual([one(m, moSo({ rotateFrom: null }), '2026-11-08').status, one(m, moSo({ rotateFrom: null }), '2026-11-08').end], ['overdue', '2026-11-07']);
  assert.deepEqual([one(m, cm, '2026-11-14').status, one(m, cm, '2026-11-14').end], ['due', '2026-11-14']);
  assert.equal(one(m, cm, '2026-11-15').status, 'overdue');
});

test('Joker einsetzbar: nur bei eigener offener Aufgabe mit Person', () => {
  const c = moSo();
  const due = one(wk(), c, '2026-11-02');
  assert.equal(canJoker(due, '2026-11-02'), true);
  assert.equal(canJoker(one(wk(), c, '2026-11-09'), '2026-11-09'), true); // rot
  assert.equal(canJoker({ ...due, status: 'upcoming' }, '2026-11-02'), false);
  assert.equal(canJoker({ ...due, status: 'done' }, '2026-11-02'), false);
  assert.equal(canJoker({ ...due, owner: null }, '2026-11-02'), false); // gemeinsam
  assert.equal(canJoker({ ...due, deferred: true }, '2026-11-02'), false); // schon verschoben
  assert.equal(canJoker({ ...due, task: wk({ n: 1, unit: 'day' }) }, '2026-11-02'), false);
  assert.equal(canJoker({ ...due, task: wk({ n: 0, unit: 'need' }) }, '2026-11-02'), false);
  assert.equal(canJoker({ ...due, status: 'overdue', end: '2026-10-20' }, '2026-11-02'), false); // neue Frist schon vorbei
});

test('Joker einsetzen: verbraucht einen, alte Merker fallen weg', () => {
  const j = { ...jokerOf({}, 'p1'), count: 2, deferred: { alt: '2026-06-01', neu: '2026-10-20' } };
  const n = useJoker(j, 'x', '2026-11-02');
  assert.equal(n.count, 1);
  assert.deepEqual(Object.keys(n.deferred).sort(), ['neu', 'x']);
});

test('Joker und Ziel: verschoben zählt erst, wenn erledigt, im Monat der neuen Frist', () => {
  const t = wk({ fixed: true }); // p1, Mo 2./9./16./23./30.11.
  const id = completionId('w', 'weekly:2026-11-30', null);
  const c = withJoker(moSo(), 'p1', id);
  assert.equal(goalStats([t], moSo(), '2026-11', new Map()).total, 5);
  assert.equal(goalStats([t], c, '2026-11', new Map()).total, 4);
  assert.equal(goalStats([t], c, '2026-12', new Map()).total, 4);
  const m = new Map([[id, { by: 'p1' }]]);
  const nov = goalStats([t], c, '2026-11', m), dec = goalStats([t], c, '2026-12', m);
  assert.deepEqual([nov.total, dec.total, dec.done], [4, 5, 1]); // Frist 13.12.
});

test('Joker und Balken: verschoben fällt raus, drängt nicht', () => {
  const t = wk({ fixed: true });
  const c = withJoker(moSo(), 'p1', completionId('w', 'weekly:2026-11-09', null));
  assert.equal(dueBetween([t], c, '2026-11-09', '2026-11-15', new Map(), 'p1').length, 0);
  assert.equal(windowsBetween(t, c, '2026-11-09', '2026-11-15').find((w) => w.start === '2026-11-09').deferred, true);
  assert.equal(isPressing(one(t, c, '2026-11-09', [['weekly:2026-11-02', null]]), '2026-11-09'), false);
});

// ---------- Serie in Wochen ----------

const fixMo = () => wk({ fixed: true }); // p1, jeden Montag
const doneKeys = (t, ...keys) => new Map(keys.map((k) => [completionId(t.id, `weekly:${k}`, null), { by: 'p1' }]));

test('Serie: volle Wochen zählen, verpasste bricht, längste bleibt', () => {
  const t = fixMo();
  const none = weekStreaks([t], moSo(), 'p1', new Map(), '2026-11-02', '2026-11-20');
  assert.deepEqual(none, { current: 0, longest: 0 });
  const m = doneKeys(t, '2026-11-02', '2026-11-09', '2026-11-23');
  // 2.11. und 9.11. erledigt, 16.11. verpasst (Frist bis 22.11.), 23.11. erledigt
  assert.deepEqual(weekStreaks([t], moSo(), 'p1', m, '2026-11-02', '2026-11-29'), { current: 1, longest: 2 });
});

test('Serie: laufende Woche bricht nicht, erledigt zählt sie gleich', () => {
  const t = fixMo();
  const m = doneKeys(t, '2026-11-02', '2026-11-09');
  // 16.11. läuft bis 22.11.: noch nicht gebrochen
  assert.equal(weekStreaks([t], moSo(), 'p1', m, '2026-11-02', '2026-11-18').current, 2);
  assert.equal(weekStreaks([t], moSo(), 'p1', m, '2026-11-02', '2026-11-22').current, 2);
  assert.equal(weekStreaks([t], moSo(), 'p1', m, '2026-11-02', '2026-11-23').current, 0);
  assert.equal(weekStreaks([t], moSo(), 'p1', new Map([...m, ...doneKeys(t, '2026-11-16')]), '2026-11-02', '2026-11-18').current, 3);
});

test('Serie: Abwesenheit und Joker unterbrechen nicht', () => {
  const t = fixMo();
  const m = doneKeys(t, '2026-11-02', '2026-11-16');
  assert.equal(weekStreaks([t], moSo(), 'p1', m, '2026-11-02', '2026-11-22').current, 1); // 9.11. verpasst
  const away = moSo({ away: { p1: { from: '2026-11-09', to: '2026-11-12' } } });
  assert.equal(weekStreaks([t], away, 'p1', m, '2026-11-02', '2026-11-22').current, 2);
  const joker = withJoker(moSo(), 'p1', completionId('w', 'weekly:2026-11-09', null));
  assert.equal(weekStreaks([t], joker, 'p1', m, '2026-11-02', '2026-11-22').current, 2);
});

test('Serie: eigene Woche ab dem Putztag, andere Person und Gemeinsames', () => {
  const b = wk({ assign: 'B', fixed: true }); // p2, jeden Sonntag
  const m = new Map([...doneKeys(b, '2026-11-02', '2026-11-09')].map(([k, c]) => [k, { ...c, by: 'p2' }]));
  // Termine 8.11. und 15.11. liegen in den Wochen ab So 8.11. und So 15.11.
  assert.equal(weekStreaks([b], moSo(), 'p2', m, '2026-11-02', '2026-11-21').current, 2);
  assert.equal(weekStreaks([b], moSo(), 'p1', m, '2026-11-02', '2026-11-21').current, 0); // p1 hat nichts
  const s = wk({ id: 's', assign: 'shared' });
  const c = moSo({ sharedDays: [0] });
  const sm = new Map([[completionId('s', 'weekly:2026-11-02', null), { by: 'p1' }]]);
  assert.equal(weekStreaks([s], c, 'p1', sm, '2026-11-02', '2026-11-08').current, 1);
});

test('Serie: Tägliches zählt nicht, vor dem Ladebereich wird nicht geurteilt', () => {
  const t = fixMo();
  const d = wk({ id: 'd', n: 1, unit: 'day' });
  const m = doneKeys(t, '2026-11-02');
  assert.equal(weekStreaks([t, d], moSo(), 'p1', m, '2026-11-02', '2026-11-08').current, 1);
  const late = doneKeys(t, '2026-11-16', '2026-11-23');
  assert.equal(weekStreaks([t], moSo(), 'p1', late, '2026-11-11', '2026-11-29').current, 2);
});

// ---------- Bis zu 6 Personen ----------

const people = (n, days = (i) => [i % 7]) => ({
  setup: '2026-11-02', rotateFrom: '2026-11', swapped: false, sharedDays: [5],
  persons: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, days: days(i) })),
});
const pkgTask = (assign, over = {}) => wk({ id: assign, assign, ...over });

test('Pakete: A bis F, jede Person eines', () => {
  assert.equal(PACKAGES.length, 6);
  assert.equal(isPackage('F'), true);
  assert.equal(isPackage('shared'), false);
  assert.deepEqual(packageOwners(people(4)), ['p1', 'p2', 'p3', 'p4']);
  assert.deepEqual(packageOwners(people(4), 1), ['p2', 'p3', 'p4', 'p1']);
  assert.deepEqual(['A', 'B', 'C', 'D'].map((a) => ownerNow(pkgTask(a), people(4), '2026-11-03')), ['p1', 'p2', 'p3', 'p4']);
});

test('Tausch mit 3 Personen: wöchentlich reihum nach dem Monat des Putztags', () => {
  const c = people(3, () => [0]); // alle am Montag
  const t = pkgTask('A');
  assert.deepEqual(['2026-11-30', '2026-12-07', '2027-01-04', '2027-02-01', '2027-03-01'].map((d) => ownerNow(t, c, d)), ['p1', 'p2', 'p3', 'p1', 'p2']);
  const w = windowsBetween(t, c, '2026-11-23', '2027-01-11');
  assert.ok(w.slice(1).every((x, i) => toDay(x.start) - toDay(w[i].start) === 7)); // gleicher Putztag: keine Lücke
  assert.equal(new Set(w.map((x) => x.key)).size, w.length);
});

test('Tausch mit 3 Personen: nichts bleibt immer bei denselben', () => {
  const owners = (t, c, dates) => new Set(dates.map((d) => ownerNow(t, c, d)));
  const c3 = people(3);
  // vierteljährlich würde bei 3 Personen sonst immer dieselbe treffen
  assert.equal(swapsByRound(pkgTask('A', { n: 3, unit: 'month' }), c3), true);
  assert.equal(owners(pkgTask('A', { n: 3, unit: 'month' }), c3, ['2027-01-10', '2027-04-10', '2027-07-10']).size, 3);
  assert.equal(owners(pkgTask('A', { n: 6, unit: 'month' }), c3, ['2027-01-10', '2027-07-10', '2028-01-10']).size, 3);
  assert.equal(owners(pkgTask('A', { n: 12, unit: 'month' }), c3, ['2027-02-10', '2028-02-10', '2029-02-10']).size, 3);
  // bei 2 Personen wie bisher: vierteljährlich nach Monat, halbjährlich je Durchgang
  assert.equal(swapsByRound(pkgTask('A', { n: 3, unit: 'month' }), people(2)), false);
  assert.equal(swapsByRound(pkgTask('A', { n: 6, unit: 'month' }), people(2)), true);
  assert.equal(owners(pkgTask('A', { n: 3, unit: 'month' }), people(4), ['2027-01-10', '2027-04-10', '2027-07-10', '2027-10-10']).size, 4);
});

test('Faire Aufteilung auf 3 bis 6 Personen: alle haben fast gleich viel Zeit', () => {
  for (const n of [3, 4, 5, 6]) {
    const split = autoSplit(OUR_TASKS, n);
    const c = people(n);
    const load = Object.values(loadByPerson(split, c));
    assert.equal(load.length, n);
    // Unterschied höchstens so groß wie die größte einzelne Aufgabe (Wäsche: 387 Min. pro Monat); der Tausch gleicht das aus
    assert.ok(Math.max(...load) - Math.min(...load) <= 387, `${n}: ${load}`);
    assert.ok(split.filter((t) => isPackage(t.assign)).every((t) => PACKAGES.indexOf(t.assign) < n));
    // Gemeinsames bleibt
    assert.equal(split.filter((t) => t.assign === 'shared').length, OUR_TASKS.filter((t) => t.assign === 'shared').length);
  }
  assert.deepEqual(autoSplit(OUR_TASKS).map((t) => t.assign), autoSplit(OUR_TASKS, 2).map((t) => t.assign));
  // Ohne eine übergroße Aufgabe wird es sehr gleichmäßig
  const even = Array.from({ length: 24 }, (_, i) => wk({ id: `e${i}`, min: 10 + (i % 4) * 5 }));
  const l3 = Object.values(loadByPerson(autoSplit(even, 3), people(3)));
  assert.ok(Math.max(...l3) - Math.min(...l3) <= 25 * 4.3, String(l3));
});

test('Aufwand, Ziel, Joker und Serie mit 4 Personen', () => {
  const c = people(4, () => [0]);
  const tasks = ['A', 'B', 'C', 'D'].map((a) => pkgTask(a, { fixed: true }));
  assert.deepEqual(Object.values(loadByPerson(tasks, c)).map(Math.round), [0, 0, 0, 0]);
  const timed = tasks.map((t) => ({ ...t, min: 60 }));
  assert.deepEqual(Object.values(loadByPerson(timed, c)).map(Math.round), [258, 258, 258, 258]);
  assert.equal(goalStats(tasks, c, '2026-11', new Map()).total, 20);
  const m = new Map([[completionId('C', 'weekly:2026-11-02', null), { by: 'p3' }]]);
  assert.equal(weekStreaks(tasks, c, 'p3', m, '2026-11-02', '2026-11-08').current, 1);
  assert.equal(weekStreaks(tasks, c, 'p1', m, '2026-11-02', '2026-11-08').current, 0);
  assert.deepEqual(['2026-11-02', '2026-12-07'].map((d) => ownerNow(pkgTask('D'), c, d)), ['p4', 'p1']);
  const shared = wk({ assign: 'shared' });
  const away = { p1: { from: '2026-11-07', to: '2026-11-08' } };
  assert.equal(goalStats([shared], { ...c, away }, '2026-11', new Map()).total, 4); // nur eine weg: bleibt
});

test('Meine Haushalte: neu nach vorne, Änderung am Platz, ohne Änderung dieselbe Liste', () => {
  const a = { code: 'A', names: 'Ana, Ben', me: 'p1', setup: '2026-11-02' };
  const b = { code: 'B', names: 'Ana, Ben, Cleo', me: 'p1', setup: '2026-12-01' };
  const one = upsertHome([], a);
  assert.deepEqual(one, [a]);
  const two = upsertHome(one, b);
  assert.deepEqual(two.map((h) => h.code), ['B', 'A']);
  assert.equal(upsertHome(two, { ...a }), two);
  assert.deepEqual(upsertHome(two, { ...a, me: 'p2' }).map((h) => [h.code, h.me]), [['B', 'p1'], ['A', 'p2']]);
});

test('Start in der Zukunft: vorher nichts fällig oder rot, erster Tausch frühestens 2 Wochen danach', () => {
  const c = moSo({ setup: '2026-11-25', rotateFrom: rotationBase('2026-11-25') });
  assert.equal(c.rotateFrom, '2026-12');
  assert.equal(nextSwap(c, '2026-11-03'), '2027-01-01');
  assert.equal(nextSwap(c, '2026-11-25'), '2027-01-01');
  const t = wk({ created: '2026-11-25' });
  assert.equal(windowsBetween(t, c, '2026-11-01', '2026-11-29').length, 0);
  const before = one(t, c, '2026-11-10');
  assert.deepEqual([before.status, before.next], ['idle', '2026-11-30']);
  assert.equal(one(t, c, '2026-11-30').status, 'due');
  assert.equal(goalResult([t], c, '2026-12-01', new Map()), null); // Startmonat zu kurz
  assert.deepEqual(weekStreaks([t], c, 'p1', new Map(), '2026-11-25', '2026-11-10'), { current: 0, longest: 0 });
  // Start mitten im Monat mit genug Zeit: Tausch am nächsten Ersten
  assert.equal(nextSwap({ rotateFrom: rotationBase('2026-11-10') }, '2026-11-10'), '2026-12-01');
});

// ---------- Vorher abhaken ----------
const rounds = (tasks, c, today, done = new Map(), me = 'p1') => nextRounds(tasks, c, me, today, done);

test('Vorher abhaken: nächste eigene Runde in 7 Tagen, ohne Tägliches, Bei Bedarf, Gemeinsames und Fremdes', () => {
  const list = [
    task({ id: 'w', assign: 'A' }), task({ id: 'b', assign: 'B' }), task({ id: 's', assign: 'shared' }),
    task({ id: 'd', n: 1, unit: 'day', assign: 'A' }), task({ id: 'n', n: 0, unit: 'need', assign: 'A' }),
  ];
  const r = rounds(list, ctx(), '2026-11-01');
  assert.deepEqual(r.map((x) => [x.task.id, x.due, x.status]), [['w', '2026-11-07', 'upcoming']]);
  assert.deepEqual(rounds(list, ctx(), '2026-11-07').map((x) => x.due), ['2026-11-14']); // heute zählt nicht als „nächste“
  assert.deepEqual(rounds([task({ id: 'p', assign: 'each' })], ctx(), '2026-11-01').map((x) => x.slot), ['p1']);
});

test('Vorher abhaken: nie ab dem nächsten Tauschtag', () => {
  const c = ctx({ rotateFrom: '2026-11' });
  const t = task({ assign: 'A' });
  assert.equal(nextSwap(c, '2026-11-24'), '2026-12-01');
  assert.deepEqual(rounds([t], c, '2026-11-24').map((x) => x.due), ['2026-11-28']);
  assert.deepEqual(rounds([t], c, '2026-11-29'), []); // Termin 5.12. liegt nach dem Tausch
  assert.deepEqual(rounds([t], ctx(), '2026-11-29').map((x) => x.due), ['2026-12-05']); // ohne Tausch keine Grenze
});

test('Vorher abhaken: Monatliches über die Periode hinaus, Haken zählt für diesen Termin', () => {
  const t = task({ n: 1, unit: 'month', assign: 'A' });
  const [r] = rounds([t], ctx(), '2026-11-30');
  assert.equal(r.due, '2026-12-05');
  const id = completionId(t.id, r.key, r.slot);
  const c = { id, by: 'p1', day: '2026-11-30', taskId: t.id, key: r.key };
  const done = new Map([[id, c]]);
  assert.equal(rounds([t], ctx(), '2026-11-30', done)[0].status, 'done');
  assert.equal(evaluate(t, ctx(), '2026-12-05', done)[0].status, 'done');
  assert.ok(dueBetween([t], ctx(), '2026-12-01', '2026-12-31', done, 'p1')[0].done);
  assert.equal(goalStats([t], ctx(), '2026-12', done).percent, 100);
  assert.equal(dueBetween([t], ctx(), '2026-11-01', '2026-11-30', done, 'p1')[0].done, null); // November bleibt offen
});

test('Vorher abhaken: Wöchentliches gilt für die Woche des Termins und in der Serie', () => {
  const t = task({ assign: 'A' });
  const c0 = ctx({ persons: [{ id: 'p1', name: 'Anna', days: [5] }, { id: 'p2', name: 'Ben', days: [5] }] });
  const key = (today) => rounds([t], c0, today)[0].key;
  const mk = (k, day) => { const id = completionId(t.id, k, null); return [id, { id, by: 'p1', day, taskId: t.id, key: k }]; };
  const done = new Map([mk(key('2026-10-30'), '2026-10-30'), mk(key('2026-11-02'), '2026-11-02')]);
  assert.equal(evaluate(t, c0, '2026-11-07', done)[0].status, 'done');
  assert.equal(dueBetween([t], c0, '2026-11-07', '2026-11-13', done, 'p1')[0].done.day, '2026-11-02');
  assert.equal(weekStreaks([t], c0, 'p1', done, '2026-10-28', '2026-11-13').current, 2);
});

test('Vorher abhaken: Abwesenheit, Joker und Saison', () => {
  const t = task({ assign: 'A' });
  const away = ctx({ away: { p1: { from: '2026-11-06', to: '2026-11-08' } } });
  assert.deepEqual(rounds([t], away, '2026-11-01'), []);
  const off = task({ assign: 'A', season: { from: 3, to: 5 } });
  assert.deepEqual(rounds([off], ctx(), '2026-11-01'), []);
  const r = rounds([t], ctx(), '2026-11-01')[0];
  const joker = ctx({ joker_p1: { deferred: { [completionId(t.id, r.key, null)]: '2026-11-01' } } });
  assert.deepEqual(rounds([t], joker, '2026-11-01'), []);
});

// ---------- Personenfarben ----------
test('Farbvorschlag: Reihenfolge, Vergebenes wird übersprungen', () => {
  assert.equal(suggestColor([]), 'koralle');
  assert.equal(suggestColor(['koralle']), 'tuerkis');
  assert.equal(suggestColor(['koralle', 'violett']), 'tuerkis');
  assert.equal(suggestColor(['koralle', 'tuerkis', 'violett', 'senf', 'blau']), 'gruen');
  assert.equal(PALETTE.length, 8);
});

test('Farben umstellen: ähnlichste neue, Violett bleibt, keine doppelten', () => {
  const ps = (...c) => c.map((color, i) => ({ id: `p${i}`, color }));
  const colors = (...c) => migrateColors(ps(...c)).map((p) => p.color);
  const same = ps('violett', 'gruen');
  assert.equal(migrateColors(same), same); // nichts zu tun: dieselbe Liste
  assert.deepEqual(colors('violett', 'gelb'), ['violett', 'senf']);
  assert.deepEqual(colors('rot', 'blau'), ['koralle', 'blau']);
  assert.deepEqual(colors('gelb', 'gold'), ['senf', 'koralle']); // gold will auch senf → nächster freier Vorschlag
  assert.deepEqual(colors('schwarz', 'weiss'), ['koralle', 'tuerkis']);
  assert.deepEqual(colors('gruen', 'gruen'), ['gruen', 'koralle']);
  assert.deepEqual(colors('senf', 'gelb'), ['senf', 'koralle']);
  assert.deepEqual(migrateColors([{ id: 'a', color: 'gelb', name: 'X', days: [1] }])[0], { id: 'a', color: 'senf', name: 'X', days: [1] });
  const all = migrateColors(ps('rot', 'gold', 'gelb', 'schwarz', 'weiss', 'rosa')).map((p) => p.color);
  assert.equal(new Set(all).size, 6);
  assert.ok(all.every((c) => PALETTE.includes(c)));
});

// ---------- Rückgängig ----------
test('Joker zurücknehmen: dritter nur durch den Haken, der ihn gebracht hat', () => {
  const j = { ...jokerOf({}, 'p1'), count: 2, earned: 2, progress: 29 };
  const full = jokerTick(j, 1, 'c30');
  assert.equal(full.count, JOKER_MAX);
  assert.equal(full.earnedBy, 'c30');
  assert.equal(jokerTick(full, -1, 'anderer'), full); // zählte bei vollem Vorrat nicht
  assert.equal(jokerTick(full, -1), full);
  const back = jokerTick(full, -1, 'c30');
  assert.deepEqual([back.count, back.progress, back.earned, back.earnedBy], [2, 29, 2, null]);
  const again = jokerTick(back, 1, 'c31'); // wieder verdient
  assert.deepEqual([again.count, again.earned], [3, 3]);
});

test('Joker zurücknehmen: schon eingesetzt ergibt ein Minus, das die nächste Abmachung ausgleicht', () => {
  const used = { ...jokerOf({}, 'p1'), earned: 1, count: 0, progress: 0, deferred: { x: '2026-11-01' } };
  const minus = jokerTick(used, -1, 'c');
  assert.deepEqual([minus.progress, minus.count, minus.earned, minus.deferred], [-1, 0, 1, { x: '2026-11-01' }]);
  assert.equal(jokerTick(minus, 1, 'd').progress, 0);
  // der 30. Haken nach einem Minus bringt erst beim 31. den Joker
  let j = minus;
  for (let i = 0; i < JOKER_PRICE; i++) j = jokerTick(j, 1, `c${i}`);
  assert.equal(j.count, 0);
  assert.equal(jokerTick(j, 1, 'z').count, 1);
});

const stats = (over = {}) => ({ longest: 0, longestDay: null, done: {}, start: null, ...over });
const facts = (over = {}) => ({ now: {}, longest: 0, started: true, setup: '2026-10-26', ...over });

test('Meilenstein zurücknehmen: nur wenn die Grundlage weg ist und er nicht vor dem Haken erreicht wurde', () => {
  const st = stats({ done: { first: '2026-11-01', tasks100: '2026-11-01', extra100: '2026-11-01', week: '2026-10-31' } });
  const u = { day: '2026-11-01', rule: false };
  const next = revokeStats(st, u, facts({ now: { first: true, tasks100: false, week: false } }));
  assert.deepEqual(next.done, { first: '2026-11-01', extra100: '2026-11-01', week: '2026-10-31' });
  assert.equal(revokeStats(st, u, facts({ now: { first: true, tasks100: true } })), st); // alles stimmt noch: dieselben Daten
  const r = revokeStats(st, { day: '2026-11-01', rule: true }, facts({ now: {} }));
  assert.deepEqual(r.done, { first: '2026-11-01', tasks100: '2026-11-01', week: '2026-10-31' }); // Abmachung betrifft nur extra und Joker
});

test('Serie zurücknehmen: die längste sinkt mit, ältere bleibt', () => {
  const u = { day: '2026-11-07', rule: false };
  const reached = stats({ longest: 4, longestDay: '2026-11-07', done: { week4: '2026-11-07' } });
  const next = revokeStats(reached, u, facts({ now: { week4: false }, longest: 3 }));
  assert.deepEqual([next.longest, next.done], [3, {}]);
  const old = stats({ longest: 9, longestDay: '2026-05-01', done: { week4: '2026-03-01' } });
  assert.equal(revokeStats(old, u, facts({ now: { week4: false }, longest: 2 })), old); // aus einem früheren Plan
});

test('Der Anfang: Stern kommt wieder, wenn der einzige Haken zurückgenommen wurde', () => {
  const st = stats({ start: '2026-10-26' });
  assert.equal(revokeStats(st, { day: '2026-11-01', rule: false }, facts({ started: false })).start, null);
  assert.equal(revokeStats(st, { day: '2026-11-01', rule: false }, facts()), st);
  assert.equal(revokeStats(st, { day: '2026-11-01', rule: true }, facts({ started: false })), st);
});

test('Ziel zurücknehmen: nur der betroffene Monat, frühere Pläne bleiben', () => {
  const t = task({ assign: 'A' });
  const c = ctx({ setup: '2026-09-01', goal: { percent: 100, reward: '' } });
  const windows = windowsBetween(t, c, '2026-10-01', '2026-10-31').filter((w) => w.start >= '2026-10-01');
  const done = new Map(windows.map((w) => [completionId(t.id, w.key, w.slot), { by: 'p1' }]));
  const hits = { '2026-10': 'Essen', '2026-05': '' };
  assert.equal(revokeGoalHits(hits, [t], c, '2026-11-01', done), hits); // reicht noch
  done.delete(completionId(t.id, windows[0].key, windows[0].slot));
  assert.deepEqual(revokeGoalHits(hits, [t], c, '2026-11-01', done), { '2026-05': '' });
  assert.equal(revokeGoalHits(hits, [t], c, '2026-12-15', done), hits); // Haken liegt zu weit weg
  assert.equal(revokeGoalHits(hits, [t], ctx({ setup: '2026-10-25', goal: { percent: 100 } }), '2026-11-01', done), hits); // Plan neu eingerichtet
});

test('Haushalt voll: erst wenn jede Person einmal da war', () => {
  assert.equal(householdFull(ctx()), false);
  assert.equal(householdFull(ctx({ seen_p1: '2026-11-01' })), false);
  assert.equal(householdFull(ctx({ seen_p1: '2026-11-01', seen_p2: '2026-11-02' })), true);
});

test('Farbnamen: sichtbar die Farbe, für Screenreader Farbe und Tier, alle 8 vollständig', () => {
  assert.equal(colorName('koralle'), 'Koralle');
  assert.equal(colorLabel('koralle'), 'Koralle (Krabbe)');
  assert.equal(colorLabel('tuerkis'), 'Türkis (Schildkröte)');
  for (const c of PALETTE) assert.match(colorLabel(c), /^\S+ \(\S+\)$/);
});

test('Aktuell: Vergessenes zuerst, dann was drängt, was Zeit hat, was erst kommt', () => {
  const today = '2026-11-01';
  const w = task({ assign: 'A' }), m = task({ n: 1, unit: 'month', assign: 'A' });
  const late = { task: m, status: 'overdue', due: '2026-10-01', end: '2026-10-06' };
  const now = { task: w, status: 'due', due: '2026-10-31', end: '2026-11-06', deferred: false };
  const later = { task: w, status: 'due', due: '2026-10-25', end: '2026-11-06', deferred: false };
  const soon = { task: w, status: 'upcoming', due: '2026-11-07', end: '2026-11-13' };
  const order = [soon, later, now, late].sort((a, b) => urgency(a, today) - urgency(b, today));
  assert.deepEqual(order, [late, now, later, soon]);
});

// ---------- Haushalt pausieren ----------
const inPause = (over = {}) => ctx({ pauses: [{ from: '2026-11-09', to: '2026-11-22' }], persons: [{ id: 'p1', name: 'Anna', days: [5] }, { id: 'p2', name: 'Ben', days: [5] }], ...over });

test('Pause: nichts wird rot, auch Gemeinsames, ohne Abwesenheit', () => {
  const p = inPause();
  for (const t of [task({ assign: 'A' }), task({ assign: 'B' }), task({ assign: 'shared' }), task({ n: 1, unit: 'month', assign: 'shared' })]) {
    const key = windowsBetween(t, p, '2026-11-01', '2026-11-08').filter((w) => w.start < '2026-11-09').map((w) => [w.key, w.slot]);
    assert.notEqual(one(t, p, '2026-11-25', key).status, 'overdue');
  }
  assert.equal(one(task({ assign: 'A' }), ctx(), '2026-11-25').status, 'overdue'); // ohne Pause schon
});

test('Pause: Zeile fällt weg, auch Tägliches und Fremdes; vorher nur, was hineinfällt', () => {
  const p = inPause();
  const d = { task: task({ n: 1, unit: 'day' }), status: 'due', due: '2026-11-10', end: '2026-11-10' };
  assert.equal(pausedItem(d, p, '2026-11-10'), true);
  const w = { task: task({ assign: 'A' }), status: 'due', due: '2026-11-07', end: '2026-11-13' };
  assert.equal(pausedItem(w, p, '2026-11-08'), false); // Termin vor der Pause: läuft noch
  assert.equal(pausedItem(w, p, '2026-11-09'), true);
  const m = { task: task({ n: 1, unit: 'month' }), status: 'upcoming', due: '2026-11-14', end: '2026-11-19' };
  assert.equal(pausedItem(m, p, '2026-11-05'), true);
  assert.equal(pausedItem(w, ctx(), '2026-11-10'), false);
});

test('Pause: Serie, Ziel, Balken und Vorher abhaken zählen pausierte Termine nicht', () => {
  const t = task({ assign: 'A', created: '2026-10-05' });
  const p = inPause({ setup: '2026-10-05' });
  const off = ctx({ setup: '2026-10-05' });
  assert.equal(dueBetween([t], p, '2026-11-14', '2026-11-20', new Map(), 'p1').length, 0);
  assert.equal(dueBetween([t], off, '2026-11-14', '2026-11-20', new Map(), 'p1').length, 1);
  assert.ok(goalStats([t], p, '2026-11', new Map()).total < goalStats([t], off, '2026-11', new Map()).total);
  assert.deepEqual(nextRounds([t], p, 'p1', '2026-11-12', new Map()), []);
  const done = new Map(windowsBetween(t, p, '2026-10-05', '2026-12-05')
    .filter((w) => w.start < '2026-11-09' || w.start > '2026-11-22')
    .map((w) => { const id = completionId(t.id, w.key, w.slot); return [id, { id, by: 'p1', key: w.key, day: w.start }]; }));
  const withPause = weekStreaks([t], p, 'p1', done, '2026-10-05', '2026-12-06');
  assert.equal(withPause.current, withPause.longest);
  assert.ok(withPause.current >= 6);
  assert.equal(weekStreaks([t], off, 'p1', done, '2026-10-05', '2026-12-06').current < withPause.current, true); // ohne Pause bricht sie
});

test('Pause: unabhängig von der Abwesenheit, beide dürfen sich überschneiden', () => {
  const p = inPause({ away: { p1: { from: '2026-11-20', to: '2026-11-30' } } });
  assert.equal(awayDuring(p, 'p1', toDay('2026-11-10'), toDay('2026-11-10')), false); // Pause ist keine Abwesenheit
  assert.equal(awayDuring(p, 'p2', toDay('2026-11-25'), toDay('2026-11-25')), false);
  assert.equal(pauseDuring(p, toDay('2026-11-25'), toDay('2026-11-25')), false);
  assert.equal(dueBetween([task({ assign: 'A' })], p, '2026-11-28', '2026-12-03', new Map(), 'p1').length, 0); // Abwesenheit wirkt danach weiter
});

test('Pause setzen, ändern, beenden; vergangene bleiben', () => {
  let l = setPause([], 'from', '2026-11-09', '2026-11-01');
  assert.deepEqual(l, [{ from: '2026-11-09', to: '2026-11-09' }]);
  l = setPause(l, 'to', '2026-11-22', '2026-11-01');
  assert.deepEqual(l, [{ from: '2026-11-09', to: '2026-11-22' }]);
  assert.deepEqual(setPause(l, 'to', '2026-11-05', '2026-11-01'), [{ from: '2026-11-05', to: '2026-11-05' }]); // das geänderte Datum gewinnt
  assert.deepEqual(endPause(l, '2026-11-01'), []); // noch nicht begonnen
  assert.deepEqual(endPause(l, '2026-11-15'), [{ from: '2026-11-09', to: '2026-11-14' }]); // Bisheriges bleibt pausiert
  const old = [{ from: '2026-08-01', to: '2026-08-14' }];
  const two = setPause(old, 'from', '2026-12-20', '2026-11-01');
  assert.equal(two.length, 2);
  assert.ok(pauseDuring({ pauses: two }, toDay('2026-08-05'), toDay('2026-08-05'))); // die alte gilt weiter
  assert.equal(currentPause({ pauses: old }, '2026-11-01'), null);
  assert.deepEqual(endPause(old, '2026-11-01'), old);
});

// ---------- Abwesenheit bleibt ----------
test('Abwesenheit: eine neue macht die vergangene nicht ungültig', () => {
  const t = task({ assign: 'A', created: '2026-09-07' });
  const persons = [{ id: 'p1', name: 'Anna', days: [5] }, { id: 'p2', name: 'Ben', days: [5] }];
  const first = ctx({ setup: '2026-09-07', persons, away: { p1: { from: '2026-11-09', to: '2026-11-22' } } });
  const done = new Map(windowsBetween(t, first, '2026-10-01', '2026-12-05')
    .filter((w) => w.start >= '2026-10-31' && (w.start < '2026-11-14' || w.start > '2026-11-21'))
    .map((w) => { const id = completionId(t.id, w.key, w.slot); return [id, { id, by: 'p1', key: w.key, day: w.start }]; }));
  const before = weekStreaks([t], first, 'p1', done, '2026-10-26', '2026-12-06');
  const later = { ...first, ...changeAway(first, 'p1', { from: '2027-01-11', to: '2027-01-20' }, '2026-12-06') };
  assert.deepEqual(weekStreaks([t], later, 'p1', done, '2026-10-26', '2026-12-06'), before);
  assert.deepEqual(later.awayPast.p1, [{ from: '2026-11-09', to: '2026-11-22' }]);
  assert.deepEqual(later.away.p1, { from: '2027-01-11', to: '2027-01-20' });
  assert.equal(awayDuring(later, 'p1', toDay('2026-11-15'), toDay('2026-11-15')), true);
  assert.equal(awayDuring(later, 'p2', toDay('2026-11-15'), toDay('2026-11-15')), false);
});

test('Abwesenheit ändern: nur Vergangenes bleibt, Künftiges lässt sich frei ändern und löschen', () => {
  const a = { away: { p1: { from: '2026-11-09', to: '2026-11-22' } } };
  assert.equal(changeAway(a, 'p1', {}, '2026-11-01').awayPast, undefined); // noch nicht begonnen
  const mid = changeAway(a, 'p1', {}, '2026-11-15'); // mitten drin gelöscht
  assert.deepEqual(mid.awayPast.p1, [{ from: '2026-11-09', to: '2026-11-14' }]);
  assert.deepEqual(mid.away.p1, {});
  assert.equal(awayDuring({ ...a, ...mid }, 'p1', toDay('2026-11-16'), toDay('2026-11-16')), false); // ab heute wieder da
  const twice = { ...a, ...mid, away: { p1: { from: '2026-11-09', to: '2026-11-12' } } };
  assert.equal(changeAway(twice, 'p1', {}, '2026-11-15').awayPast, undefined); // schon abgedeckt: keine Doppelten
  assert.deepEqual(changeAway({}, 'p1', { from: '2026-12-01', to: '2026-12-02' }, '2026-11-01'), { away: { p1: { from: '2026-12-01', to: '2026-12-02' } } });
});

test('Zeitraum ändern: das geänderte Datum gewinnt, nichts wird vertauscht', () => {
  const r = { from: '2026-10-20', to: '2026-10-25' };
  assert.deepEqual(moveRange(r, 'from', '2026-11-10'), { from: '2026-11-10', to: '2026-11-10' });
  assert.deepEqual(moveRange(r, 'to', '2026-10-10'), { from: '2026-10-10', to: '2026-10-10' });
  assert.deepEqual(moveRange(r, 'to', '2026-10-28'), { from: '2026-10-20', to: '2026-10-28' });
  assert.deepEqual(moveRange(undefined, 'from', '2026-11-10'), { from: '2026-11-10', to: '2026-11-10' });
  // neue Abwesenheit eintragen: keine Tage dazwischen werden entschuldigt
  const a = { away: { p1: r } };
  const step1 = { ...a, ...changeAway(a, 'p1', moveRange(r, 'from', '2026-11-10'), '2026-11-01') };
  const step2 = { ...step1, ...changeAway(step1, 'p1', moveRange(step1.away.p1, 'to', '2026-11-15'), '2026-11-01') };
  assert.deepEqual(step2.awayPast.p1, [r]);
  assert.deepEqual(step2.away.p1, { from: '2026-11-10', to: '2026-11-15' });
  assert.equal(awayDuring(step2, 'p1', toDay('2026-10-28'), toDay('2026-10-28')), false);
});
