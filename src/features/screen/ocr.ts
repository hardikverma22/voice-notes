import type { Worker } from 'tesseract.js';

/**
 * Reads the text in screen frames with Tesseract, on this device. The library, its worker and
 * the English model (about 4 MB, kept in IndexedDB by Tesseract) load on first use only.
 */

let worker: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  worker ??= import('tesseract.js')
    .then(({ createWorker }) => createWorker('eng'))
    .catch((error: unknown) => {
      worker = null; // Offline on first use, for example; try again next time.
      throw error;
    });
  return worker;
}

/** Below this word confidence (0..100), a word is more likely noise than text. */
const MIN_CONFIDENCE = 55;

/**
 * Screenshots have icons and graphics that read as stray characters. Keeps lines that look
 * like words: at least two letters or digits in a row, and not mostly symbols.
 */
export function cleanText(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => {
      if (!/[\p{L}\p{N}]{2,}/u.test(line)) return false;
      const letters = (line.match(/[\p{L}\p{N}]/gu) ?? []).length;
      return letters / line.replace(/\s/g, '').length >= 0.5;
    })
    .join('\n');
}

/** The text in an image, cleaned. Empty when there is none. */
export async function readText(image: Blob): Promise<string> {
  const ocr = await getWorker();
  const { data } = await ocr.recognize(image, {}, { text: true, blocks: true });
  // Rebuild lines from confident words when word data is there; otherwise use the raw text.
  const lines: string[] = [];
  for (const block of data.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const words = line.words.filter((word) => word.confidence >= MIN_CONFIDENCE);
        if (words.length > 0) lines.push(words.map((word) => word.text).join(' '));
      }
    }
  }
  return cleanText(data.blocks ? lines.join('\n') : data.text);
}

export async function stopOcr(): Promise<void> {
  const current = worker;
  worker = null;
  if (current) await (await current).terminate().catch(() => undefined);
}
