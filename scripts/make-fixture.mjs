// Writes tests/fixtures/tone.wav (pure JS) and tests/fixtures/speech.wav: with the built-in `say`
// on macOS, or with espeak-ng (converted by ffmpeg) elsewhere, such as CI.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
} else if (hasCommand('espeak-ng') && hasCommand('ffmpeg')) {
  // Linux (CI): espeak-ng speaks at 22.05 kHz; convert to the 48 kHz mono 16-bit `say` makes.
  execFileSync('espeak-ng', ['-s', '140', '-w', 'tests/fixtures/speech-raw.wav', FIXTURE_SENTENCE]);
  execFileSync('ffmpeg', [
    '-loglevel',
    'error',
    '-y',
    '-i',
    'tests/fixtures/speech-raw.wav',
    '-ar',
    '48000',
    '-ac',
    '1',
    '-sample_fmt',
    's16',
    'tests/fixtures/speech.wav',
  ]);
  rmSync('tests/fixtures/speech-raw.wav');
  console.log('wrote tests/fixtures/speech.wav (espeak-ng) and tone.wav');
} else {
  console.warn(
    'No macOS `say` or espeak-ng + ffmpeg: only tone.wav written. Transcription e2e tests will skip.',
  );
}

function hasCommand(name) {
  try {
    execFileSync('which', [name], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
