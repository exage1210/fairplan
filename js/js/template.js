// Vorlage "Vorschlag für 2 Personen"
const D = { n: 1, unit: 'day' };
const W = { n: 1, unit: 'week' };
const W2 = { n: 2, unit: 'week' };
const M = { n: 1, unit: 'month' };
const Q = { n: 3, unit: 'month' };
const H = { n: 6, unit: 'month' };
const Y = { n: 12, unit: 'month' };
const N = { n: 0, unit: 'need' }; // bei Bedarf

const t = (title, iv, assign, extra = {}) => ({ title, ...iv, assign, note: '', season: null, ...extra });
const season = (from, to) => ({ season: { from, to } });

// Abmachungen: Selbstverständliches ohne Abhaken
export const TEMPLATE_RULES = [
  'Geschirr und Küche (Herd, Flächen) macht, wer nicht kocht',
  'Abends kurz gemeinsam aufräumen',
];

export const TEMPLATE = [
  t('Müll rausbringen', N, 'shared'),
  t('Pflanzen kontrollieren', D, 'alternate'),
  t('Pflanzen gießen bei Hitze', N, 'shared', season(6, 8)),

  t('Wäsche (waschen, aufhängen, zusammenlegen)', W, 'A'),
  t('Handtücher wechseln', W, 'A'),
  t('Kühlschrank auf Abgelaufenes prüfen', W, 'A'),
  t('Bügeln', W, 'A'),
  t('Bad und WC gründlich inkl. Boden', W2, 'A', { note: 'WC, Waschbecken, Dusche/Wanne, Spiegel' }),
  t('Bettwäsche wechseln', M, 'A'),
  t('Mikrowelle/Backrohr', M, 'A'),
  t('Abflüsse', M, 'A'),
  t('Spülmaschine und Waschmaschine reinigen', M, 'A', { note: 'Sieb, Dichtung' }),
  t('Fenster', Q, 'A'),
  t('Vorhänge', Q, 'A'),
  t('Kühlschrank auswischen', Q, 'A'),
  t('Dunstabzugsfilter', Q, 'A'),

  t('Ganze Wohnung staubsaugen', W, 'B'),
  t('Staubwischen', W, 'B'),
  t('Pflanzen gießen', W, 'B'),
  t('Loggia fegen', W, 'B'),
  t('Einkaufen', W, 'B'),
  t('Vorzimmer aufwaschen', W2, 'B'),
  t('Küche aufwaschen', W2, 'B'),
  t('Böden Wohn-, Kinder- und Schlafzimmer aufwaschen', M, 'B'),
  t('Türen/Lichtschalter/Griffe', M, 'B'),
  t('Pflanzenblätter abstauben und welke Teile entfernen', M, 'B'),
  t('Matratze absaugen/wenden', Q, 'B'),
  t('Heizkörper', Q, 'B'),
  t('Küchenschränke außen', Q, 'B'),
  t('Loggia-Boden und Geländer nass reinigen', Q, 'B'),
  t('Pflanzen düngen', Q, 'B', season(3, 10)),

  t('Grundreinigung Küchen- und Vorratsschränke', H, 'shared'),
  t('Hinter/unter Möbeln', H, 'shared'),
  t('Lampen', H, 'shared'),
  t('Fliesenfugen', H, 'shared'),
  t('Entkalken', H, 'shared'),
  t('Gewand saisonal tauschen', H, 'shared'),
  t('Loggia-Pflanzen einwintern', H, 'shared', season(9, 11)),
  t('Loggia-Pflanzen ins Freie stellen', H, 'shared', season(3, 5)),
  t('Töpfe/Untersetzer reinigen', H, 'shared'),
  t('Auto putzen', H, 'shared'),
  t('Lüftungsfilter im Bad', H, 'shared'),
  t('Gewand ausmisten', H, 'each'),

  t('Grundreinigung Kleider-, Kinder- und Wohnzimmerschränke', Y, 'shared'),
  t('Großes Ausmisten', Y, 'shared', { note: 'Bücher, Küche, Keller/Abstellraum, Dokumente, Elektronik' }),
  t('Gefrierschrank abtauen', Y, 'shared'),
  t('Medikamente/Kosmetik auf Ablaufdatum prüfen', Y, 'shared'),
  t('Pflanzen umtopfen', Y, 'shared', season(3, 5)),
  t('Gewand ausmisten', Y, 'each'),
];
