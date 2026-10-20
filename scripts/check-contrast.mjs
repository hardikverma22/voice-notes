// Checks WCAG 2.x contrast of required token pairs in src/design/tokens.css (light and dark).
import { readFileSync } from 'node:fs';

const css = readFileSync('src/design/tokens.css', 'utf8').replaceAll('"', "'");
function block(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Missing block: ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--vn-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  );
}
function lum(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const PAIRS = [
  ['--vn-fg', '--vn-bg', 4.5],
  ['--vn-fg', '--vn-surface', 4.5],
  ['--vn-fg-muted', '--vn-bg', 4.5],
  ['--vn-fg-muted', '--vn-surface', 4.5],
  ['--vn-accent-fg', '--vn-accent', 4.5],
  ['--vn-accent', '--vn-bg', 3],
  ['--vn-danger', '--vn-bg', 4.5],
  ['--vn-focus', '--vn-bg', 3],
  ['--vn-border', '--vn-bg', 1.3],
  ['--vn-control', '--vn-bg', 3],
];
let failed = false;
const darkMedia = block(":root:not([data-theme='light'])");
const darkAttr = block(":root[data-theme='dark']");
if (JSON.stringify(darkMedia) !== JSON.stringify(darkAttr)) {
  console.error(
    'FAIL dark values differ between the prefers-color-scheme block and the [data-theme=dark] block',
  );
  failed = true;
}
const light = block(':root {');
for (const [name, tokens] of [
  ['light', light],
  ['dark', { ...light, ...darkAttr }],
]) {
  for (const [fg, bg, min] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      console.error(`FAIL ${name}: missing ${!tokens[fg] ? fg : bg} (must be a 6-digit hex)`);
      failed = true;
      continue;
    }
    const r = ratio(tokens[fg], tokens[bg]);
    if (r < min) failed = true;
    console.log(
      `${r >= min ? 'PASS' : 'FAIL'} ${name} ${fg} on ${bg}: ${r.toFixed(2)} (min ${min})`,
    );
  }
}
process.exit(failed ? 1 : 0);
