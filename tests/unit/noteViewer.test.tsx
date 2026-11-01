import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '../../src/design/motion';
import { ToastProvider } from '../../src/design/components/Toast';
import NotePage from '../../src/features/notes/NotePage';
import {
  RecordingContext,
  type RecordingContextValue,
} from '../../src/features/recorder/recordingContext';
import { db } from '../../src/storage/db';
import { addSessionFrame, adoptSessionFrames } from '../../src/storage/frames';
import { applyTranscript, createNote } from '../../src/storage/notes';

const idleRecording = {
  state: 'idle',
  elapsedMs: 0,
  analyser: null,
  errorCode: null,
  live: { committed: [], tentative: '' },
  lastSavedId: null,
  targetNoteId: null,
  markCount: 0,
  screen: { status: 'off', stream: null, frameCount: 0, lastFrameAt: null, supported: false },
  drawingFrame: null,
} as unknown as RecordingContextValue;
const noop = () => {};
for (const key of [
  'start',
  'startFor',
  'mark',
  'stop',
  'pause',
  'resume',
  'discard',
  'toggle',
  'dismissSaved',
  'startWithScreen',
  'shareScreen',
  'stopScreen',
  'snap',
  'drawNow',
  'endDraw',
] as const) {
  (idleRecording as unknown as Record<string, () => void>)[key] = noop;
}

beforeAll(() => {
  // Node's own createObjectURL rejects the Blobs fake-indexeddb hands back.
  URL.createObjectURL = vi.fn(() => 'blob:frame');
  URL.revokeObjectURL = vi.fn();
  Element.prototype.scrollIntoView ??= vi.fn();
});
afterEach(async () => {
  cleanup();
  await db.notes.clear();
  await db.frames.clear();
});

describe('frame viewer on the note page', () => {
  // Regression: the Screen section sits inside the editor, which is re-created when a note
  // unlocks. The viewer used to live in that section, so it closed when a transcript landed.
  it(
    'stays open when the transcript finishes while you are marking up a frame',
    { timeout: 20_000 },
    async () => {
      const note = await createNote({
        title: 'Bug report',
        contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
        plainText: '',
        segments: [],
        audioId: null,
        durationMs: 5000,
        language: 'english',
        modelId: 'test',
        device: 'wasm',
        status: 'transcribing',
      });
      const image = { mimeType: 'image/png', width: 1280, height: 720, source: 'auto' as const };
      await addSessionFrame('s', { ...image, blob: new Blob(['px']), t: 1 });
      await adoptSessionFrames('s', note.id);

      render(
        <MotionProvider>
          <ToastProvider>
            <RecordingContext.Provider value={idleRecording}>
              <NotePage id={note.id} />
            </RecordingContext.Provider>
          </ToastProvider>
        </MotionProvider>,
      );
      const [markUp] = await screen.findAllByRole(
        'button',
        { name: /^Mark up/ },
        { timeout: 5000 },
      );
      act(() => markUp!.click());
      expect(await screen.findByRole('dialog', { name: 'Frame 1 of 1' })).toBeInTheDocument();

      await act(async () => {
        await applyTranscript(note.id, {
          contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
          plainText: 'It fails here.',
          segments: [{ start: 0, end: 2, text: 'It fails here.' }],
          title: 'Bug report',
          language: 'english',
          modelId: 'test',
          device: 'wasm',
        });
      });
      // The editor unlocked (it is re-created), and the viewer is still open.
      await waitFor(async () => expect((await db.notes.get(note.id))?.status).toBe('ready'));
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(screen.getByRole('dialog', { name: 'Frame 1 of 1' })).toBeInTheDocument();
    },
  );
});
