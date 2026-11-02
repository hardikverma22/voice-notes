// Writes tests/fixtures/tone.wav (pure JS) and tests/fixtures/speech.wav: with the built-in `say`
// on macOS, or with espeak-ng (converted by ffmpeg) elsewhere, such as CI.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';

const FIXTURE_SENTENCE = 'The quick brown fox jumps over the lazy dog.';
mkdirSync('tests/fixtures', { recursive: true });

function writeWav(path, samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff), i * 2),
  );
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

const rate = 48000;
const tone = Array.from(
  { length: rate * 3 },
  (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / rate),
);
writeWav('tests/fixtures/tone.wav', tone, rate);

if (platform() === 'darwin') {
  execFileSync('say', [
    '-o',
    'tests/fixtures/speech.wav',
    '--file-format=WAVE',
    '--data-format=LEI16@48000',
    FIXTURE_SENTENCE,
  ]);
  console.log('wrote tests/fixtures/speech.wav and tone.wav');
} else if (hasCommand('espeak-ng')) {
  // Linux (CI): espeak-ng speaks 16-bit mono at its own rate (22.05 kHz); resample to the 48 kHz
  // that `say` makes.
  const raw = execFileSync('espeak-ng', ['-s', '140', '--stdout', FIXTURE_SENTENCE]);
  const { samples, sampleRate } = readWav(raw);
  writeWav('tests/fixtures/speech.wav', resample(samples, sampleRate, rate), rate);
  console.log('wrote tests/fixtures/speech.wav (espeak-ng) and tone.wav');
} else {
  console.warn(
    'No macOS `say` or espeak-ng: only tone.wav written. Transcription e2e tests will skip.',
  );
}

/** 16-bit PCM mono WAV to samples in -1..1. Walks the chunks, so extra chunks are fine. */
function readWav(buffer) {
  let offset = 12;
  let sampleRate = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    // espeak-ng --stdout writes 0x7fffffff sizes; the data runs to the end of the buffer.
    let size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') sampleRate = buffer.readUInt32LE(offset + 12);
    if (id === 'data') {
      size = Math.min(size, buffer.length - offset - 8);
      const samples = new Float32Array(Math.floor(size / 2));
      for (let i = 0; i < samples.length; i++) {
        samples[i] = buffer.readInt16LE(offset + 8 + i * 2) / 0x8000;
      }
      return { samples, sampleRate };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('No audio data in the WAV from espeak-ng');
}

/** Linear resampling; fine for a test fixture. */
function resample(samples, from, to) {
  const out = new Float32Array(Math.round((samples.length * to) / from));
  for (let i = 0; i < out.length; i++) {
    const x = (i * from) / to;
    const j = Math.floor(x);
    const a = samples[j] ?? 0;
    const b = samples[j + 1] ?? a;
    out[i] = a + (b - a) * (x - j);
  }
  return out;
}

function hasCommand(name) {
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
