import { replaceNoteAudio } from '../../storage/audio';
import { db } from '../../storage/db';
import { createNote, setNoteAudio } from '../../storage/notes';
import { transcriptToDoc } from '../notes/transcriptToDoc';
import { decodeToPcm16k } from '../recorder/decode';
import { encodeWav } from '../recorder/wav';
import { MODEL_ID, SAMPLE_RATE } from '../transcribe/config';
import { getModelState, loadModel } from '../transcribe/modelStore';
import { getTranscriptionSettings } from '../transcribe/settings';
import { enqueueTranscription } from '../transcribe/transcriptionQueue';

/**
 * Turns an existing audio or video file into a note: decoded on this device, saved with its
 * audio, then transcribed by the normal queue. Loaded on demand (import button or drop).
 */

export const MAX_IMPORT_MINUTES = 60;
const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|ogg|oga|opus|webm|flac|mp4|mov|m4v|mkv)$/i;

export class ImportError extends Error {}

export function isImportable(file: File): boolean {
  return (
    file.type.startsWith('audio/') ||
    file.type.startsWith('video/') ||
    AUDIO_EXTENSIONS.test(file.name)
  );
}

function titleFrom(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim() || 'Imported recording'
  );
}

export async function importAudioFile(file: File): Promise<string> {
  if (!isImportable(file)) throw new ImportError(`“${file.name}” is not an audio or video file.`);
  let pcm: Float32Array;
  try {
    pcm = await decodeToPcm16k(file);
  } catch {
    throw new ImportError(`“${file.name}” could not be read. Try an mp3, m4a or wav file.`);
  }
  const seconds = pcm.length / SAMPLE_RATE;
  if (seconds < 0.5) throw new ImportError(`“${file.name}” has no sound in it.`);
  if (seconds > MAX_IMPORT_MINUTES * 60) {
    throw new ImportError(
      `“${file.name}” is ${Math.round(seconds / 60)} minutes long; the limit is ${MAX_IMPORT_MINUTES}.`,
    );
  }
  // Video files keep only their sound, as WAV: the picture is not needed and can be huge.
  const audio = file.type.startsWith('video/') ? encodeWav(pcm, SAMPLE_RATE) : file;
  const createdAt =
    file.lastModified > 0 && file.lastModified <= Date.now() ? file.lastModified : Date.now();
  const note = await createNote({
    title: titleFrom(file.name),
    contentJson: JSON.stringify(transcriptToDoc('')),
    plainText: '',
    segments: [],
    audioId: null,
    durationMs: Math.round(seconds * 1000),
    language: getTranscriptionSettings().language,
    modelId: MODEL_ID,
    device: getModelState().device ?? 'wasm',
    status: 'queued',
  });
  const record = await replaceNoteAudio(note.id, audio);
  await setNoteAudio(note.id, record.id);
  // Both calls stamp "now"; an imported memo belongs at the date it was recorded.
  await db.notes.update(note.id, { createdAt, updatedAt: createdAt });
  loadModel();
  enqueueTranscription(note.id, pcm);
  return note.id;
}
