import { getLanguage } from '../../app/settings';
import { createNote } from '../../storage/notes';
import { MODEL_ID } from '../transcribe/config';
import { transcriptToDoc } from './transcriptToDoc';

/** Creates an empty typed note and returns its id. */
export async function createTextNote(): Promise<string> {
  const note = await createNote({
    title: '',
    contentJson: JSON.stringify(transcriptToDoc('')),
    plainText: '',
    segments: [],
    audioId: null,
    durationMs: 0,
    language: getLanguage(),
    modelId: MODEL_ID,
    device: 'wasm',
  });
  return note.id;
}
