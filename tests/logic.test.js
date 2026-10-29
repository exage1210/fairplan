import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toDay, fromDay, isoWeek, kindOf, evaluate, completionId, relevantKeys,
  nextSwap, packageOwners, inSeason, dueDay, groupOf, windowsBetween, awayDuring,
  timesPerMonth, monthlyMinutes, loadByPerson, autoSplit,
} from '../js/logic.js';

const ctx = (over = {}) => ({
  setup: '2026-10-28',
  persons: [{ id: 'p1', name: 'Anna' }, { id: 'p2', name: 'Ben' }],
  swapped: false,
  rotation: { short: 2, quarter: 6, half: 12, year: 12 },
  sharedDay: { halfyearMonth: 4, halfyearDay: 15, yearlyMonth: 4, yearlyDay: 15 },
  ...over,
});
const task = (over = {}) => ({ id: 't', title: 'T', n: 1, unit: 'week', assign: 'shared', season: null, created: '2026-10-28', ...over });
const one = (t, c, today, done = []) => {
  const m = new Map(done.map(([key, slot]) => [completionId(t.id, key, slot), { by: 'p1' }]));
  return evaluate(t, c, today, m)[0];
};

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

test('wöchentlich: KW 53 ist eine Periode über den Jahreswechsel', () => {
  const t = task();
  const a = one(t, ctx(), '2026-12-29');
  const b = one(t, ctx(), '2027-01-02');
  assert.equal(a.key, 'weekly:2026-12-28');
  assert.equal(b.key, a.key);
  // in KW 53 erledigt → am 3.1. noch erledigt, ab 4.1. wieder fällig
  assert.equal(one(t, ctx(), '2027-01-03', [[a.key, null]]).status, 'done');
  const next = one(t, ctx(), '2027-01-04', [[a.key, null]]);
  assert.equal(next.status, 'due');
  assert.equal(next.key, 'weekly:2027-01-04');
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

test('erste Periode nach dem Anlegen gilt nicht als verpasst', () => {
  const t = task({ created: '2026-10-28' }); // Mittwoch
  assert.equal(one(t, ctx(), '2026-10-28').status, 'due');
  assert.equal(one(t, ctx(), '2026-11-03').status, 'due'); // Woche davor begann vor dem Anlegen
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

test('monatlich, vierteljährlich, jährlich: Jahreswechsel', () => {
  assert.equal(one(task({ n: 1, unit: 'month' }), ctx(), '2026-12-31').key, 'monthly:2026-12-01');
  assert.equal(one(task({ n: 1, unit: 'month' }), ctx(), '2027-01-01').key, 'monthly:2027-01-01');
  assert.equal(one(task({ n: 3, unit: 'month' }), ctx(), '2026-12-31').key, 'quarterly:2026-10-01');
  assert.equal(one(task({ n: 3, unit: 'month' }), ctx(), '2027-01-01').key, 'quarterly:2027-01-01');
  const q = one(task({ n: 3, unit: 'month', created: '2026-09-01' }), ctx(), '2027-01-05');
  assert.equal(q.status, 'overdue'); // Q4 2026 nicht erledigt
});

test('halbjährlich: Frühjahr/Herbst mit gemeinsamem Tag und Lücken', () => {
  const t = task({ n: 6, unit: 'month', created: '2026-01-10' });
  const c = ctx({ setup: '2026-01-10' });
  // Frühjahr 2026, gemeinsamer Tag 15.4.
  assert.equal(one(t, c, '2026-03-20').status, 'upcoming');
  const due = one(t, c, '2026-04-15');
  assert.equal(due.status, 'due');
  assert.equal(due.key, 'halfyear:2026-03-01');
  // Sommerlücke: verpasst → überfällig mit Frühjahrs-Schlüssel
  const gap = one(t, c, '2026-07-01');
  assert.equal(gap.status, 'overdue');
  assert.equal(gap.key, 'halfyear:2026-03-01');
  // im Frühjahr erledigt → Sommer ruhig, nächste Fälligkeit 15.10.
  const idle = one(t, c, '2026-07-01', [['halfyear:2026-03-01', null]]);
  assert.equal(idle.status, 'idle');
  assert.equal(idle.next, '2026-10-15');
  // Winterlücke über den Jahreswechsel gehört zum Herbst
  assert.equal(one(t, c, '2027-01-20').key, 'halfyear:2026-09-01');
  assert.equal(one(t, c, '2027-01-20', [['halfyear:2026-09-01', null]]).next, '2027-04-15');
});

test('fester Tag schon vorbei beim Anlegen → erst nächste Periode', () => {
  const y = one(task({ n: 12, unit: 'month' }), ctx(), '2026-10-28');
  assert.equal(y.status, 'idle');
  assert.equal(y.next, '2027-04-15');
  const h = one(task({ n: 6, unit: 'month' }), ctx(), '2026-11-02');
  assert.equal(h.status, 'idle');
  assert.equal(h.next, '2027-04-15');
});

test('Saison: Grenzen auch über den Jahreswechsel', () => {
  assert.ok(inSeason({ from: 11, to: 2 }, 12));
  assert.ok(inSeason({ from: 11, to: 2 }, 1));
  assert.ok(!inSeason({ from: 11, to: 2 }, 3));
  const t = task({ season: { from: 11, to: 2 }, created: '2026-10-01' });
  assert.equal(one(t, ctx(), '2026-10-28').status, 'offseason');
  assert.equal(one(t, ctx(), '2026-10-28').next, '2026-11-02');
  // Woche 29.12.–4.1. liegt in der Saison; nicht erledigt → am 5.1. überfällig
  assert.equal(one(t, ctx(), '2027-01-05').status, 'overdue');
  assert.equal(one(t, ctx(), '2027-03-01').status, 'offseason');
  // erste Woche der Saison startet im Oktober → zählt nicht (Fälligkeit wäre Ende Okt)
  const w = task({ season: { from: 11, to: 2 }, created: '2026-10-01' });
  assert.equal(one(w, ctx(), '2026-11-03').status, 'due');
});

test('Saison verschiebt Fälligkeit in die Saison (vierteljährlich März–Okt)', () => {
  const t = task({ n: 3, unit: 'month', season: { from: 3, to: 10 } });
  const q1 = { start: toDay('2027-01-01'), end: toDay('2027-03-31') };
  assert.equal(fromDay(dueDay(t, q1, ctx())), '2027-03-01');
  // jährlich mit gemeinsamem Tag außerhalb der Saison → Saisonbeginn
  const y = task({ n: 12, unit: 'month', season: { from: 3, to: 5 } });
  const yr = { start: toDay('2027-01-01'), end: toDay('2027-12-31') };
  assert.equal(fromDay(dueDay(y, yr, ctx({ sharedDay: { halfyearMonth: 4, halfyearDay: 15, yearlyMonth: 12, yearlyDay: 1 } }))), '2027-03-01');
  // täglich außerhalb der Saison → keine Fälligkeit
  const d = task({ n: 1, unit: 'day', season: { from: 6, to: 8 } });
  assert.equal(dueDay(d, { start: toDay('2027-05-31'), end: toDay('2027-05-31') }, ctx()), null);
});

test('Rotation: Paket A/B tauscht alle 2 Monate ab Einrichtungsmonat', () => {
  const c = ctx();
  assert.deepEqual(packageOwners('short', c, toDay('2026-10-28')), ['p1', 'p2']);
  assert.deepEqual(packageOwners('short', c, toDay('2026-11-30')), ['p1', 'p2']);
  assert.deepEqual(packageOwners('short', c, toDay('2026-12-01')), ['p2', 'p1']);
  assert.deepEqual(packageOwners('short', c, toDay('2027-01-31')), ['p2', 'p1']);
  assert.deepEqual(packageOwners('short', c, toDay('2027-02-01')), ['p1', 'p2']);
  assert.equal(nextSwap('short', c, '2026-10-28'), '2026-12-01');
  assert.equal(nextSwap('short', c, '2026-12-15'), '2027-02-01');
  assert.equal(nextSwap('quarter', c, '2026-12-15'), '2027-04-01');
  // manuell umgedreht
  assert.deepEqual(packageOwners('short', ctx({ swapped: true }), toDay('2026-10-28')), ['p2', 'p1']);
});

test('Rotation: Zuständigkeit folgt der Periode, nicht dem heutigen Tag', () => {
  const t = task({ assign: 'A', created: '2026-11-01' });
  // Woche 30.11.–6.12. beginnt im November → noch Anna
  assert.equal(one(t, ctx(), '2026-12-02').owner, 'p1');
  // Woche ab 7.12. → Ben
  assert.equal(one(t, ctx(), '2026-12-08', [['weekly:2026-11-30', null]]).owner, 'p2');
  // Anna hat ihre letzte Woche verpasst → überfällig bleibt bei Anna
  const o = one(t, ctx(), '2026-12-08');
  assert.equal(o.status, 'overdue');
  assert.equal(o.owner, 'p1');
  assert.equal(one(task({ assign: 'B' }), ctx(), '2026-10-28').owner, 'p2');
});

test('Intervallgruppen', () => {
  assert.equal(groupOf({ n: 1, unit: 'month' }), 'short');
  assert.equal(groupOf({ n: 3, unit: 'month' }), 'quarter');
  assert.equal(groupOf({ n: 6, unit: 'month' }), 'half');
  assert.equal(groupOf({ n: 12, unit: 'month' }), 'year');
  assert.equal(groupOf({ n: 10, unit: 'day' }), 'short');
});

test('täglich abwechselnd, auch über den Jahreswechsel', () => {
  const t = task({ n: 1, unit: 'day', assign: 'alternate' });
  const owners = ['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']
    .map((d) => one(t, ctx({ setup: '2026-12-30' }), d, [[`daily:${fromDay(toDay(d) - 1)}`, null]]).owner);
  assert.deepEqual(owners, ['p1', 'p2', 'p1', 'p2']);
  assert.equal(one(t, ctx({ setup: '2026-12-30', swapped: true }), '2026-12-30', [['daily:2026-12-29', null]]).owner, 'p2');
});

test('pro Person: jede Person hat einen eigenen Eintrag', () => {
  const t = task({ assign: 'each' });
  const m = new Map([[completionId('t', 'weekly:2026-10-26', 'p1'), { by: 'p1' }]]);
  const items = evaluate(t, ctx(), '2026-10-28', m);
  assert.deepEqual(items.map((i) => [i.owner, i.status]), [['p1', 'done'], ['p2', 'due']]);
});

test('außerhalb der Saison bleibt die Zuständigkeit erhalten', () => {
  const items = evaluate(task({ assign: 'each', season: { from: 11, to: 2 } }), ctx(), '2026-10-28', new Map());
  assert.deepEqual(items.map((i) => [i.status, i.owner]), [['offseason', 'p1'], ['offseason', 'p2']]);
  assert.equal(one(task({ assign: 'B', season: { from: 11, to: 2 } }), ctx(), '2026-10-28').owner, 'p2');
});

test('freie Intervalle zählen ab dem Einrichtungstag', () => {
  const t = task({ n: 10, unit: 'day' });
  assert.equal(one(t, ctx(), '2026-11-06').key, '10d:2026-10-28');
  assert.equal(one(t, ctx(), '2026-11-07').key, '10d:2026-11-07');
  const m = task({ n: 2, unit: 'month' });
  assert.equal(one(m, ctx(), '2026-11-30').key, '2m:2026-10-01');
  assert.equal(one(m, ctx(), '2027-01-01').key, '2m:2026-12-01');
});

test('relevante Schlüssel enthalten aktuelle und vorherige Periode', () => {
  const keys = relevantKeys([task(), task({ id: 'h', n: 6, unit: 'month' })], ctx(), '2027-01-05');
  assert.deepEqual(keys, ['halfyear:2026-09-01', 'weekly:2026-12-28', 'weekly:2027-01-04']);
});

test('Zeitfenster: längere Intervalle sind in der zweiten Hälfte ihrer Periode dran', () => {
  // alle 2 Wochen: Block 26.10.–8.11., dran in der 2. Woche
  const b = task({ n: 2 });
  const u = one(b, ctx(), '2026-10-28');
  assert.equal(u.status, 'upcoming');
  assert.deepEqual([u.due, u.end], ['2026-11-02', '2026-11-08']);
  assert.equal(one(b, ctx(), '2026-11-02').status, 'due');
  // nicht geschafft → im nächsten Block überfällig, mit Ende des verpassten Fensters
  const o = one(b, ctx(), '2026-11-10');
  assert.deepEqual([o.status, o.end], ['overdue', '2026-11-08']);
  // monatlich ab dem 15., vierteljährlich im 3. Monat
  assert.equal(one(task({ n: 1, unit: 'month' }), ctx(), '2026-11-14').status, 'upcoming');
  assert.equal(one(task({ n: 1, unit: 'month' }), ctx(), '2026-11-15').status, 'due');
  assert.equal(one(task({ n: 3, unit: 'month' }), ctx(), '2026-11-30').due, '2026-12-01');
});

test('Kalender: Zeitfenster samt Zuständigkeit', () => {
  const w = windowsBetween(task({ n: 2, assign: 'A' }), ctx(), '2026-11-01', '2026-12-31');
  assert.deepEqual(w.map((x) => [x.start, x.end, x.owner]), [
    ['2026-11-02', '2026-11-08', 'p1'],
    ['2026-11-16', '2026-11-22', 'p1'],
    ['2026-11-30', '2026-12-06', 'p1'],
    ['2026-12-14', '2026-12-20', 'p2'],
    ['2026-12-28', '2027-01-03', 'p2'],
  ]);
  // vor dem Anlegen gibt es keine Fenster
  assert.equal(windowsBetween(task({ created: '2026-11-20' }), ctx(), '2026-11-01', '2026-11-15').length, 0);
});

test('Wochentag: wöchentlich ab Freitag, alle 2 Wochen am Mittwoch, Rhythmus versetzbar', () => {
  const prev = [['weekly:2026-10-26', null]];
  const w = one(task({ wd: 4 }), ctx(), '2026-11-03', prev);
  assert.deepEqual([w.status, w.due, w.end, w.key], ['upcoming', '2026-11-06', '2026-11-08', 'weekly:2026-11-02']);
  assert.equal(one(task({ wd: 4 }), ctx(), '2026-11-06', prev).status, 'due');
  // Fr 30.10. nicht geschafft → ab Montag überfällig
  const o = one(task({ wd: 4 }), ctx(), '2026-11-02');
  assert.deepEqual([o.status, o.due, o.end], ['overdue', '2026-10-30', '2026-11-01']);
  const b = windowsBetween(task({ n: 2, wd: 2 }), ctx(), '2026-11-01', '2026-11-30').map((x) => x.start);
  assert.deepEqual(b, ['2026-11-04', '2026-11-18']);
  const v = windowsBetween(task({ n: 2, wd: 2, wk: 1 }), ctx(), '2026-10-26', '2026-11-30').map((x) => x.start);
  assert.deepEqual(v, ['2026-10-28', '2026-11-11', '2026-11-25']);
});

test('Start des Plans: nichts davor zählt, auch wenn die Aufgabe älter ist', () => {
  const c = ctx({ setup: '2026-11-02' });
  const t = task({ created: '2026-10-01' });
  assert.equal(one(t, c, '2026-11-03').status, 'due'); // Woche 26.10. liegt vor dem Start → nicht überfällig
  assert.equal(one(t, c, '2026-11-01').status, 'idle');
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

test('Abwesenheit pausiert: verpasst während Urlaub → nicht überfällig', () => {
  const t = task({ assign: 'A', created: '2026-11-01' });
  const away = { p1: { from: '2026-11-05', to: '2026-11-12' } };
  assert.equal(one(t, ctx(), '2026-11-10').status, 'overdue');
  assert.equal(one(t, ctx({ away }), '2026-11-10').status, 'due');
  // Gemeinsames pausiert nur, wenn beide weg sind
  const s = task({ created: '2026-11-01' });
  assert.equal(one(s, ctx({ away }), '2026-11-10').status, 'overdue');
  assert.equal(one(s, ctx({ away: { ...away, p2: away.p1 } }), '2026-11-10').status, 'due');
  assert.ok(awayDuring(ctx({ away }), 'p1', toDay('2026-11-12'), toDay('2026-11-20')));
  assert.ok(!awayDuring(ctx({ away }), 'p1', toDay('2026-11-13'), toDay('2026-11-20')));
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

test('Faire Aufteilung: je Gruppe ausgeglichen, Gemeinsames zählt halb, Pakettausch abschaltbar', () => {
  const w = (min, assign = 'A') => task({ n: 1, unit: 'week', min, assign });
  const split = autoSplit([w(60), w(30), w(20), w(10), task({ n: 3, unit: 'month', min: 90, assign: 'A' }), w(40, 'shared')]);
  assert.deepEqual(split.map((t) => t.assign), ['A', 'B', 'B', 'B', 'A', 'shared']); // 60 | 30+20+10
  const load = loadByPerson(split, ctx(), toDay('2026-11-01'));
  assert.ok(Math.abs(load.p1 - load.p2 - 30) < 1e-9); // Vierteljährliches (90/3) bleibt in seiner Gruppe allein bei A
  // Pakettausch nach 2 Monaten tauscht die Last; abgeschaltet bleibt sie
  const later = toDay('2027-01-05');
  assert.deepEqual(packageOwners('short', ctx(), later), ['p2', 'p1']);
  assert.deepEqual(packageOwners('short', ctx({ rotationOff: true }), later), ['p1', 'p2']);
});
