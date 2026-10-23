// Exit 1 if the JavaScript loaded at start-up is over budget, or transformers.js leaked out of the
// worker chunks. Start-up means the entry script plus every chunk index.html preloads: the bundler
// moves shared code into preloaded chunks, so measuring the entry alone under-counts.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_GZIP_KB = 170;
const html = readFileSync('dist/index.html', 'utf8');
const startup = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
if (!startup.some((f) => f.startsWith('assets/index-'))) {
  console.error('Entry chunk not found in dist/index.html');
  process.exit(1);
}
let kb = 0;
for (const file of startup) {
  const size = gzipSync(readFileSync(`dist/${file}`)).length / 1024;
  kb += size;
  console.log(`  ${file}: ${size.toFixed(1)} kB gzip`);
}
console.log(`start-up JS: ${kb.toFixed(1)} kB gzip (budget ${BUDGET_GZIP_KB} kB)`);
let failed = kb > BUDGET_GZIP_KB;
for (const f of readdirSync('dist/assets').filter(
  (n) => n.endsWith('.js') && !n.startsWith('whisper.worker-') && !n.startsWith('embed.worker-'),
)) {
  const src = readFileSync(`dist/assets/${f}`, 'utf8');
  if (src.includes('onnxruntime') || src.includes('automatic-speech-recognition')) {
    console.error(`transformers.js code found outside the worker: ${f}`);
    failed = true;
  }
}
const sw = readFileSync('dist/sw.js', 'utf8');
if (/\.(onnx|wasm)["']/.test(sw)) {
  console.error('Service worker precaches .onnx or .wasm files');
  failed = true;
}
process.exit(failed ? 1 : 0);
