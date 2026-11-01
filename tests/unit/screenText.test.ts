// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanText } from '../../src/features/screen/ocr';
import { buildReportMarkdown } from '../../src/features/screen/report';
import { rowSnippet, filterNotes } from '../../src/features/notes/groupNotes';
import { VoiceNotesDB, type Note } from '../../src/storage/db';
import {
  addSessionFrame,
  adoptSessionFrames,
  listUnreadFrames,
  screenTextOf,
  setFrameText,
} from '../../src/storage/frames';
import { createNote, getNote } from '../../src/storage/notes';

describe('cleanText', () => {
  it('keeps real lines and drops icon noise', () => {
    expect(cleanText('Payment failed: card_declined\n  @ » ©  \n|\nTotal  86.00\n~=-')).toBe(
      'Payment failed: card_declined\nTotal 86.00',
    );
  });
});

describe('rowSnippet', () => {
  const note = { plainText: 'The pay button fails.', screenText: 'Payment failed: card_declined' };

  it('shows the screen text, marked, when only it matches', () => {
    expect(rowSnippet(note, 'card_declined')).toEqual({
      text: 'Payment failed: card_declined',
      onScreen: true,
    });
  });

  it('prefers the note body when it matches', () => {
    expect(rowSnippet(note, 'button').onScreen).toBe(false);
    expect(rowSnippet(note, '').onScreen).toBe(false);
  });

  it('lets library search match screen text', () => {
    expect(
      filterNotes(
        [{ ...note, title: 'x', tags: [], bookmarks: [] } as unknown as Note],
        'declined',
      ),
    ).toHaveLength(1);
  });
});

describe('report screen text', () => {
  it('adds a fenced block that code on screen cannot break out of', () => {
    const md = buildReportMarkdown({
      title: 't',
      createdAt: 0,
      durationMs: 0,
      noteMarkdown: '',
      segments: [],
      bookmarks: [],
      frames: [{ file: 'f.webp', t: 0, marked: false, text: '', screenText: 'run ```rm``` now' }],
    });
    expect(md).toContain('Text on screen:\n\n````text\nrun ```rm``` now\n````');
    expect(md).toContain('read from the frame by OCR');
  });
});

describe('frame text storage', () => {
  let database: VoiceNotesDB;
  beforeEach(() => {
    database = new VoiceNotesDB('test-' + crypto.randomUUID());
  });
  afterEach(async () => {
    database.close();
    await database.delete();
  });

  it('joins frame texts in time order', () => {
    expect(
      screenTextOf([{ t: 5, text: 'b' }, { t: 1, text: ' a ' }, { t: 3, text: '' }, { t: 4 }]),
    ).toBe('a\n\nb');
  });

  it('lists unread saved frames and rolls their text up to the note', async () => {
    const note = await createNote(
      {
        title: 'n',
        contentJson: '{}',
        plainText: '',
        segments: [],
        audioId: null,
        durationMs: 0,
        language: 'english',
        modelId: 'm',
        device: 'wasm',
      },
      database,
    );
    const image = {
      blob: new Blob(['x']),
      mimeType: 'image/png',
      width: 1,
      height: 1,
      source: 'auto' as const,
    };
    const a = await addSessionFrame('s', { ...image, t: 2 }, database);
    const b = await addSessionFrame('s', { ...image, t: 1 }, database);
    await addSessionFrame('running', { ...image, t: 0 }, database);
    expect(await listUnreadFrames(database)).toHaveLength(0); // still recording
    await adoptSessionFrames('s', note.id, 0, database);
    expect((await listUnreadFrames(database)).map((f) => f.id).sort()).toEqual([a.id, b.id].sort());

    await setFrameText(a.id, 'second', database);
    await setFrameText(b.id, 'first', database);
    expect(await listUnreadFrames(database)).toHaveLength(0);
    expect((await getNote(note.id, database))?.screenText).toBe('first\n\nsecond');
  });
});
