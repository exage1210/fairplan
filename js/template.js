// Vorlage "Vorschlag für 2 Personen"
const D = { n: 1, unit: 'day' };
const W = { n: 1, unit: 'week' };
const W2 = { n: 2, unit: 'week' };
const M = { n: 1, unit: 'month' };
const Q = { n: 3, unit: 'month' };
const H = { n: 6, unit: 'month' };
const Y = { n: 12, unit: 'month' };
const N = { n: 0, unit: 'need' }; // bei Bedarf

// min: geschätzte Minuten pro Durchgang; perMonth: bei Bedarf geschätzt, wie oft im Monat
const t = (title, iv, assign, min, extra = {}) => ({ title, ...iv, assign, min, note: '', season: null, ...extra });
const season = (from, to) => ({ season: { from, to } });

// Abmachungen: Selbstverständliches, täglich für beide abhakbar (nie „offen“)
// Beim Vorschlag alle dabei, bei „Leer starten“ und in den Optionen zum Auswählen.
export const TEMPLATE_RULES = [
  'Geschirr und Küche (Herd und Flächen)',
  'Einkaufen',
  'Kochen',
  'Kurz aufräumen',
];

export const TEMPLATE = [
  t('Müll rausbringen', N, 'shared', 5, { perMonth: 8 }),
  t('Pflanzen kontrollieren', D, 'alternate', 3),
  t('Pflanzen gießen bei Hitze', N, 'shared', 10, { perMonth: 8, ...season(6, 8) }),

  t('Wäsche (waschen, aufhängen, zusammenlegen)', W, 'A', 60),
  t('Handtücher wechseln', W, 'A', 5),
  t('Kühlschrank auf Abgelaufenes prüfen', W, 'A', 5),
  t('Bügeln', W, 'A', 30),
  t('Bad und WC gründlich inkl. Boden', W2, 'A', 45, { note: 'WC, Waschbecken, Dusche/Wanne, Spiegel' }),
  t('Bettwäsche wechseln', M, 'A', 20),
  t('Mikrowelle/Backrohr', M, 'A', 20),
  t('Abflüsse', M, 'A', 10),
  t('Spülmaschine und Waschmaschine reinigen', M, 'A', 20, { note: 'Sieb, Dichtung' }),
  t('Fenster', Q, 'A', 90),
  t('Vorhänge', Q, 'A', 30),
  t('Kühlschrank auswischen', Q, 'A', 30),
  t('Dunstabzugsfilter', Q, 'A', 15),

  t('Ganze Wohnung staubsaugen', W, 'B', 30),
  t('Staubwischen', W, 'B', 20),
  t('Pflanzen gießen', W, 'B', 15),
  t('Loggia fegen', W, 'B', 10),
  t('Vorzimmer aufwaschen', W2, 'B', 15),
  t('Küche aufwaschen', W2, 'B', 20),
  t('Böden Wohn-, Kinder- und Schlafzimmer aufwaschen', M, 'B', 45),
  t('Türen/Lichtschalter/Griffe', M, 'B', 15),
  t('Pflanzenblätter abstauben und welke Teile entfernen', M, 'B', 20),
  t('Matratze absaugen/wenden', Q, 'B', 20),
  t('Heizkörper', Q, 'B', 30),
  t('Küchenschränke außen', Q, 'B', 20),
  t('Loggia-Boden und Geländer nass reinigen', Q, 'B', 30),
  t('Pflanzen düngen', Q, 'B', 15, season(3, 10)),

  t('Grundreinigung Küchen- und Vorratsschränke', H, 'shared', 90),
  t('Hinter/unter Möbeln', H, 'shared', 60),
  t('Lampen', H, 'shared', 30),
  t('Fliesenfugen', H, 'shared', 60),
  t('Entkalken', H, 'shared', 30),
  t('Gewand saisonal tauschen', H, 'shared', 45),
  t('Loggia-Pflanzen einwintern', H, 'shared', 60, season(9, 11)),
  t('Loggia-Pflanzen ins Freie stellen', H, 'shared', 30, season(3, 5)),
  t('Töpfe/Untersetzer reinigen', H, 'shared', 30),
  t('Auto putzen', H, 'shared', 60),
  t('Lüftungsfilter im Bad', H, 'shared', 15),
  t('Gewand ausmisten', H, 'each', 30),

  t('Grundreinigung Kleider-, Kinder- und Wohnzimmerschränke', Y, 'shared', 120),
  t('Großes Ausmisten', Y, 'shared', 180, { note: 'Bücher, Küche, Keller/Abstellraum, Dokumente, Elektronik' }),
  t('Gefrierschrank abtauen', Y, 'shared', 60),
  t('Medikamente/Kosmetik auf Ablaufdatum prüfen', Y, 'shared', 20),
  t('Pflanzen umtopfen', Y, 'shared', 60, season(3, 5)),
  t('Gewand ausmisten', Y, 'each', 45),
];
