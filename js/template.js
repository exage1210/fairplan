// Vorlage: alle Aufgaben mit Bereich, Rhythmus und Dauer (geschätzt für ca. 70 m²), dazu Abmachungen.
// Wirkt nur beim Einrichten, bestehende Haushalte ändern sich dadurch nicht.
const W = { n: 1, unit: 'week' };
const W2 = { n: 2, unit: 'week' };
const M = { n: 1, unit: 'month' };
const Q = { n: 3, unit: 'month' };
const H = { n: 6, unit: 'month' };
const Y = { n: 12, unit: 'month' };
const N = { n: 0, unit: 'need' }; // bei Bedarf

export const AREAS = [
  ['kueche', 'Küche'],
  ['bad', 'Bad'],
  ['boden', 'Böden und Staub'],
  ['waesche', 'Wäsche und Schlafen'],
  ['ordnung', 'Fenster und Ordnung'],
  ['pflanzen', 'Pflanzen'],
  ['aussen', 'Balkon und Garten'],
  ['kind', 'Kind'],
  ['tier', 'Haustier'],
  ['auto', 'Auto'],
];

// min: geschätzte Minuten pro Durchgang; note: graue Zeile; perMonth: bei Bedarf geschätzt, wie oft im Monat;
// when: nur wenn es das im Haushalt gibt (ohne when = Kern).
// Zuteilung: Halbjährliches, Jährliches und Bei Bedarf gemeinsam, der Rest geht über autoSplit an die Personen.
const t = (title, iv, area, min, extra = {}) => ({
  title, ...iv, area, min, assign: iv.n >= 6 || iv.unit === 'need' ? 'shared' : 'A', note: '', season: null, ...extra,
});
const season = (from, to) => ({ season: { from, to } });
const FRUEHLING_HERBST = { season: { from: 3, to: 5, from2: 9, to2: 11 } };

export const TEMPLATE = [
  // Wöchentlich
  t('Wäsche', W, 'waesche', 60, { note: 'Waschen bis wegräumen' }),
  t('Staubsaugen', W, 'boden', 30),
  t('Bad kurz putzen', W, 'bad', 15, { note: 'WC, Waschbecken, Spiegel, Handtücher wechseln' }),
  t('Pflanzen gießen', W, 'pflanzen', 15, { when: 'pflanzen' }),

  // Alle 2 Wochen
  t('Böden wischen', W2, 'boden', 30),
  t('Staubwischen', W2, 'boden', 20),
  t('Bett neu beziehen', W2, 'waesche', 20),
  t('Garten: Rasen mähen', W2, 'aussen', 45, { when: 'garten', ...season(4, 10) }),
  t('Garten: Laub rechen', W2, 'aussen', 45, { when: 'garten', ...season(10, 11) }),

  // Monatlich
  t('Bad gründlich putzen', M, 'bad', 45, { note: 'Dusche, Boden' }),
  t('Balkon kehren', M, 'aussen', 10, { when: 'balkon' }),
  t('Pflanzen düngen', M, 'pflanzen', 15, { when: 'pflanzen', ...season(3, 10) }),
  t('Garten: Unkraut jäten', M, 'aussen', 30, { when: 'garten', ...season(4, 9) }),
  t('Kind: Spielzeug reinigen', M, 'kind', 20, { when: 'kind' }),
  t('Haustier: Schlafplatz waschen', M, 'tier', 10, { when: 'haustier' }),
  t('Haustier: Katzenklo komplett', M, 'tier', 15, { when: 'haustier' }),
  t('Haustier: Käfig/Aquarium', M, 'tier', 30, { when: 'haustier' }),
  t('Auto waschen', M, 'auto', 30, { when: 'auto' }),

  // Vierteljährlich
  t('Kühlschrank putzen', Q, 'kueche', 30),
  t('Balkon nass putzen', Q, 'aussen', 30, { when: 'balkon' }),
  t('Backrohr putzen', Q, 'kueche', 20, { note: 'Inkl. Mikrowelle' }),
  t('Blätter abstauben', Q, 'pflanzen', 20, { when: 'pflanzen' }),
  t('Geschirrspüler reinigen', Q, 'kueche', 15, { when: 'geschirrspueler', note: 'Sieb, Dichtung' }),
  t('Waschmaschine reinigen', Q, 'waesche', 15),
  t('Griffe und Schalter abwischen', Q, 'boden', 15),
  t('Couch absaugen', Q, 'boden', 15),
  t('Dunstabzug reinigen', Q, 'kueche', 15, { note: 'Filter' }),
  t('Geräte entkalken', Q, 'kueche', 15, { note: 'Wasserkocher, Kaffeemaschine' }),
  t('Staubsauger reinigen', Q, 'boden', 10),
  t('Duschvorhang waschen', Q, 'bad', 10, { when: 'duschvorhang' }),

  // Halbjährlich
  t('Schränke auswischen', H, 'ordnung', 120, { note: 'Innen' }),
  t('Fenster putzen', H, 'ordnung', 90, { note: 'Inkl. Rahmen, Fensterbänke', ...FRUEHLING_HERBST }),
  t('Fugen putzen', H, 'bad', 60),
  t('Unter Möbeln putzen', H, 'boden', 45, { note: 'Inkl. Fußleisten' }),
  t('Gewand tauschen', H, 'waesche', 45, { note: 'Frühling, Herbst', ...FRUEHLING_HERBST }),
  t('Heizkörper abstauben', H, 'boden', 30),
  t('Teppiche waschen', H, 'boden', 30, { note: 'Inkl. Badematten' }),
  t('Bettdecken und Polster waschen', H, 'waesche', 30),
  t('Lampen abstauben', H, 'boden', 30),
  t('Kind: Kinderwagen reinigen', H, 'kind', 30, { when: 'kind' }),
  t('Kind: Kindersitz waschen', H, 'kind', 30, { when: 'kind' }),
  t('Auto innen saugen', H, 'auto', 30, { when: 'auto' }),
  t('Schränke außen abwischen', H, 'ordnung', 20),
  t('Matratze wenden', H, 'waesche', 15),
  t('Lüftung reinigen', H, 'bad', 15),

  // Jährlich
  t('Ausmisten', Y, 'ordnung', 180, { note: 'Inkl. Keller, Dokumente' }),
  t('Garten winterfest machen', Y, 'aussen', 120, { when: 'garten', ...season(10, 11) }),
  t('Pflanzen umtopfen', Y, 'pflanzen', 60, { when: 'pflanzen', ...season(3, 5) }),
  t('Balkon winterfest machen', Y, 'aussen', 60, { when: 'balkon', note: 'Pflanzen rein', ...season(9, 11) }),
  t('Garten: Hecke schneiden', Y, 'aussen', 60, { when: 'garten' }),
  t('Gewand ausmisten', Y, 'waesche', 45, { assign: 'each', note: 'Pro Person' }),
  t('Balkon frühlingsfit machen', Y, 'aussen', 60, { when: 'balkon', note: 'Pflanzen raus, Töpfe reinigen', ...season(3, 5) }),
  t('Vorhänge waschen', Y, 'waesche', 30),
  t('Badapotheke prüfen', Y, 'bad', 20, { note: 'Ablaufdatum' }),
  t('Rauchmelder testen', Y, 'ordnung', 10),

  // Bei Bedarf
  t('Gefrierschrank abtauen', N, 'kueche', 60, { perMonth: 0.08 }), // 1× pro Jahr
  t('Abflüsse reinigen', N, 'bad', 10, { perMonth: 0.33 }), // 1× pro Quartal
  t('Mistkübel auswaschen', N, 'kueche', 10, { perMonth: 1 }),
];

// Abmachungen: Selbstverständliches, täglich für beide abhakbar (nie „offen“)
export const TEMPLATE_RULES = [
  'Geschirr und Küche',
  'Kochen',
  'Einkaufen',
  'Kühlschrank prüfen',
  'Kurz aufräumen',
  'Müll rausbringen',
  'Altglas und Altpapier',
  'Pflanzen gießen bei Hitze',
  'Kind: Hochstuhl und Wickeltisch abwischen',
  'Haustier: Näpfe reinigen',
];

// Abmachungen, die es nur gibt, wenn es das im Haushalt gibt (wie when bei den Aufgaben)
export const RULE_WHEN = {
  'Pflanzen gießen bei Hitze': 'pflanzen',
  'Kind: Hochstuhl und Wickeltisch abwischen': 'kind',
  'Haustier: Näpfe reinigen': 'haustier',
};

// Vorschlag ohne Zusatzantworten: nur der Kern
export const CORE_TASKS = TEMPLATE.filter((x) => !x.when);
export const CORE_RULES = TEMPLATE_RULES.filter((r) => !RULE_WHEN[r]);

// Daniel und Sabrina: Vorlage mit unseren Abweichungen (nur solange wir testen, vor Verkauf entfernen)
const OUR_HOME = ['kind', 'auto', 'geschirrspueler', 'duschvorhang', 'balkon', 'pflanzen'];
const OUR_CHANGES = {
  'Wäsche': { title: 'Wäsche inkl. Bügeln', min: 90 },
  'Bett neu beziehen': M,
};
export const OUR_TASKS = TEMPLATE.filter((x) => !x.when || OUR_HOME.includes(x.when))
  .map((x) => ({ ...x, title: x.title.replace('Balkon', 'Loggia'), ...OUR_CHANGES[x.title] }));
export const OUR_RULES = TEMPLATE_RULES.filter((r) => !RULE_WHEN[r] || OUR_HOME.includes(RULE_WHEN[r]));

// Vorschläge zum Auswählen: die häufigsten immer sichtbar, der Rest nach Bereichen zum Aufklappen.
// Kennung einer Abmachung ist ihr Text, Vorschläge also nicht umformulieren (sonst in RULE_RENAMED eintragen).
export const RULE_COMMON = ['Geschirr und Küche', 'Kochen', 'Einkaufen', 'Kühlschrank prüfen', 'Kurz aufräumen', 'Müll rausbringen', 'Altglas und Altpapier', 'Betten machen'];
export const RULE_GROUPS = [
  ['kueche', 'Küche', ['Geschirrspüler ein- und ausräumen', 'Frühstück herrichten', 'Tisch decken']],
  ['haushalt', 'Haushalt', ['Wäsche aufhängen', 'Post holen', 'Saugroboter leeren']],
  ['kind', 'Kind', ['Kind: Hochstuhl und Wickeltisch abwischen', 'Kind ins Bett bringen', 'Kind baden', 'Jause herrichten', 'Spielzeug wegräumen']],
  ['tier', 'Haustier', ['Haustier: Näpfe reinigen', 'Haustier füttern', 'Gassi gehen', 'Katzenklo reinigen']],
  ['pflanzen', 'Pflanzen und Garten', ['Pflanzen gießen bei Hitze', 'Garten gießen']],
];
export const RULE_SUGGESTIONS = [...RULE_COMMON, ...RULE_GROUPS.flatMap((g) => g[2])];

// Umbenannte Vorschläge: bei „Plan neu einrichten“ wird aus dem alten Text der neue, damit nichts doppelt steht
export const RULE_RENAMED = { 'Geschirr und Küche (Herd und Flächen)': 'Geschirr und Küche' };

// Abmachungen, die nur in einer Saison erscheinen (Monate)
export const RULE_SEASONS = { 'Pflanzen gießen bei Hitze': { from: 6, to: 8 } };
