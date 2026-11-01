import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTE } from '../js/logic.js';

// Lesbarkeit aller Personenfarben in Dunkel, Hell und Farbe, direkt aus styles.css gerechnet
const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const hex = (name, scope = css) => {
  const m = scope.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`));
  assert.ok(m, `${name} fehlt`);
  return m[1];
};
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const atLeast = (a, b, min, what) => assert.ok(contrast(a, b) >= min, `${what}: ${contrast(a, b).toFixed(2)} (${a} auf ${b})`);

const dark = css.slice(css.indexOf(':root'), css.indexOf('[data-theme="light"]'));
const light = css.slice(css.indexOf('[data-theme="light"], [data-theme="zart"] {'));
const DARK = { bg: hex('--bg', dark), surface: hex('--surface', dark) };
const LIGHT = { bg: hex('--bg', light), surface: hex('--surface', light) };

for (const c of PALETTE) {
  const block = css.match(new RegExp(`\\[data-accent="${c}"\\], \\[data-c="${c}"\\] \\{[^}]*\\}`))?.[0];
  test(`Farbe ${c}: lesbar in Dunkel, Hell und Farbe`, () => {
    assert.ok(block, 'Akzent fehlt');
    const base = hex(`--c-${c}`), strong = hex(`--s-${c}`), text = hex('--a-text', block);
    // Dunkel: Text, Checkbox und Balken, Häkchen auf der Füllung
    atLeast(text, DARK.bg, 4.5, 'Dunkel Text');
    atLeast(text, DARK.surface, 4.5, 'Dunkel Text auf Kachel');
    atLeast(base, DARK.surface, 3, 'Dunkel Checkbox/Balken');
    atLeast('#111216', base, 4.5, 'Dunkel Knopfschrift');
    // Hell: kräftiger Ton als Text, Checkbox, Balken und Kalenderpunkt
    atLeast(strong, LIGHT.surface, 4.5, 'Hell Text auf Kachel');
    atLeast(strong, LIGHT.bg, 4.5, 'Hell Text');
    atLeast('#ffffff', strong, 4.5, 'Hell Knopfschrift');
    // Tier auf zarter Tönung, Hell und Farbe gleich
    atLeast(base, hex('--a-soft', block), 3, 'Dunkel Tier');
    atLeast(strong, hex('--a-soft-l', block), 3, 'Hell Tier');
    // Farbe: eigene Tönung
    const zBg = hex('--z-bg', block), zSurf = hex('--z-surf', block);
    atLeast(strong, zBg, 4.5, 'Farbe Text');
    atLeast(strong, zSurf, 3, 'Farbe Punkt/Rand auf Tönung');
    atLeast(hex('--z-fg', block), zBg, 7, 'Farbe Schrift');
    atLeast(hex('--z-fg2', block), zBg, 4.5, 'Farbe Nebenschrift');
    atLeast(hex('--z-fg2', block), '#ffffff', 4.5, 'Farbe Nebenschrift auf Kachel');
  });
}

test('Keine alten Farben mehr im Stylesheet', () => {
  assert.doesNotMatch(css, /gelb|--c-rot|--c-gold|schwarz|weiss/);
});
