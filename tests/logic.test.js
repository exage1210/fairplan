import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATE, TEMPLATE_RULES, suggestTasks, suggestRules, OUR_TASKS, OUR_RULES, AREAS, QUESTIONS } from '../js/template.js';
import {
  toDay, fromDay, isoWeek, kindOf, evaluate, completionId, relevantKeys,
  packageOwners, rotationBase, swapCount, nextSwap, ownerNow, inSeason, windowsBetween, awayDuring,
  timesPerMonth, monthlyMinutes, loadByPerson, autoSplit, spreadPositions, slackOf, holidays, dueBetween, streaks,
  personalWeek, isPressing,
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

test('streaks: heute darf fehlen, Lücke bricht, Abwesenheit nicht', () => {
  assert.deepEqual(streaks([], '2026-11-10'), { current: 0, longest: 0 });
  assert.deepEqual(streaks(['2026-11-08', '2026-11-09'], '2026-11-10'), { current: 2, longest: 2 });
  assert.deepEqual(streaks(['2026-11-08', '2026-11-09', '2026-11-10'], '2026-11-10'), { current: 3, longest: 3 });
  assert.deepEqual(streaks(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-09'], '2026-11-10'), { current: 1, longest: 3 });
  assert.deepEqual(streaks(['2026-11-06', '2026-11-09'], '2026-11-10', (d) => d === '2026-11-07' || d === '2026-11-08'), { current: 2, longest: 2 });
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
  assert.deepEqual([0, 1, 2, 3].map((n) => packageOwners(three, n)), [['p1', 'p2'], ['p2', 'p3'], ['p3', 'p1'], ['p1', 'p2']]);
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
