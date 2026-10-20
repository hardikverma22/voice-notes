// Exit 1 if the main entry chunk is over budget or transformers.js leaked out of the worker chunk.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_GZIP_KB = 150;
const html = readFileSync('dist/index.html', 'utf8');
const entry = html.match(
  /<script type="module" crossorigin src="[^"]*?(assets\/index-[^"]+\.js)"/,
)?.[1];
if (!entry) {
  console.error('Entry chunk not found in dist/index.html');
  process.exit(1);
}
const kb = gzipSync(readFileSync(`dist/${entry}`)).length / 1024;
console.log(`main entry ${entry}: ${kb.toFixed(1)} kB gzip (budget ${BUDGET_GZIP_KB} kB)`);
let failed = kb > BUDGET_GZIP_KB;
for (const f of readdirSync('dist/assets').filter(
  (n) => n.endsWith('.js') && !n.startsWith('whisper.worker-'),
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
