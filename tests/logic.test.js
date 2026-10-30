import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDay, fromDay, isoWeek, kindOf, evaluate, completionId, relevantKeys,
  packageOwners, inSeason, windowsBetween, awayDuring,
  timesPerMonth, monthlyMinutes, loadByPerson, autoSplit, spreadPositions, slackOf, holidays, dueBetween, streaks,
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
  // Woche ab 2.11. nicht erledigt → in der Woche ab 9.11. überfällig
  const o = one(t, ctx(), '2026-11-10');
  assert.equal(o.status, 'overdue');
  assert.equal(o.key, 'weekly:2026-11-09');
  // nach mehreren verpassten Wochen trotzdem genau ein Element
  const items = evaluate(t, ctx(), '2026-12-15', new Map());
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'overdue');
  // Abhaken (für die aktuelle Periode) → erledigt
  assert.equal(one(t, ctx(), '2026-12-15', [['weekly:2026-12-14', null]]).status, 'done');
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
  assert.equal(one(t, ctx(), '2026-11-08').key, 'biweekly:2026-10-26');
  assert.equal(one(t, ctx(), '2026-11-09').key, 'biweekly:2026-11-09');
  // 26.10. + 5×14 Tage = 4.1.2027
  assert.equal(one(t, ctx(), '2027-01-03').key, 'biweekly:2026-12-21');
  assert.equal(one(t, ctx(), '2027-01-04').key, 'biweekly:2027-01-04');
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

test('wöchentlich: am Putztag dran, 2 Tage Spielraum, dann vergessen', () => {
  const t = task({ assign: 'A' });
  assert.deepEqual(st(t, ctx(), '2026-10-29'), ['upcoming', '2026-10-31', '2026-11-02']);
  assert.deepEqual(st(t, ctx(), '2026-10-31'), ['due', '2026-10-31', '2026-11-02']);
  // Montag: neue Woche, aber der Samstag ist noch im Spielraum
  const mo = one(t, ctx(), '2026-11-02');
  assert.deepEqual([mo.status, mo.key], ['due', 'weekly:2026-10-26']);
  const di = one(t, ctx(), '2026-11-03');
  assert.deepEqual([di.status, di.end, di.key], ['overdue', '2026-11-02', 'weekly:2026-11-02']);
  assert.deepEqual(st(t, ctx(), '2026-11-03', [['weekly:2026-10-26', null]]), ['upcoming', '2026-11-07', '2026-11-09']);
});

test('vergessen erscheint nur einmal, verpasste Wochen stapeln sich nicht', () => {
  const t = task({ assign: 'A' });
  assert.equal(one(t, ctx(), '2026-11-24').status, 'overdue');
  assert.equal(evaluate(t, ctx(), '2026-11-24', new Map()).length, 1);
  // der aktuelle Termin selbst vorbei → vergessen, mit dessen Spielraum
  assert.deepEqual(st(t, ctx(), '2026-11-24'), ['overdue', '2026-11-21', '2026-11-23']);
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

test('alle 2 Wochen: Block ab der Startwoche, pos = Woche, 3 Tage Spielraum', () => {
  const t = (pos) => task({ n: 2, unit: 'week', assign: 'A', pos });
  assert.deepEqual(st(t(0), ctx(), '2026-10-29'), ['upcoming', '2026-10-31', '2026-11-03']);
  assert.deepEqual(st(t(1), ctx(), '2026-10-29'), ['upcoming', '2026-11-07', '2026-11-10']);
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
  assert.deepEqual(relevantKeys([t], ctx(), '2026-11-04'), ['weekly:2026-10-26', 'weekly:2026-11-02']);
  const w = windowsBetween(t, ctx(), '2026-11-01', '2026-11-15');
  assert.deepEqual(w.map((x) => [x.start, x.end, x.owner]), [
    ['2026-10-31', '2026-11-02', 'p1'], ['2026-11-07', '2026-11-09', 'p1'], ['2026-11-14', '2026-11-16', 'p1'],
  ]);
});

test('Abwesenheit pausiert: verpasst während Urlaub → nicht vergessen', () => {
  const t = task({ assign: 'A' });
  const away = { p1: { from: '2026-10-30', to: '2026-11-02' } };
  assert.equal(one(t, ctx(), '2026-11-04').status, 'overdue');
  assert.equal(one(t, ctx({ away }), '2026-11-04').status, 'upcoming');
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
