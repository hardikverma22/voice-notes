import { describe, expect, it } from 'vitest';
import { filterNotes, groupNotes, snippet } from '../../src/features/notes/groupNotes';
import type { Note } from '../../src/storage/db';

const NOW = new Date(2026, 9, 21, 15, 0).getTime();
const DAY = 86_400_000;

function note(id: string, createdAt: number, extra: Partial<Note> = {}): Note {
  return {
    id,
    title: id,
    contentJson: '{}',
    plainText: '',
    segments: [],
    audioId: null,
    durationMs: 0,
    language: 'english',
    modelId: 'm',
    device: 'wasm',
    createdAt,
    updatedAt: createdAt,
    pinned: false,
    status: 'ready',
    autoTitle: false,
    tags: [],
    bookmarks: [],
    pendingAppend: null,
    ...extra,
  };
}

describe('groupNotes', () => {
  it('puts pinned first, then relative day groups, then months', () => {
    const groups = groupNotes(
      [
        note('today', NOW - 1000),
        note('pinned', NOW - 40 * DAY, { pinned: true }),
        note('yesterday', NOW - DAY),
        note('week', NOW - 3 * DAY),
        note('old', new Date(2026, 7, 5).getTime()),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual([
      'Pinned',
      'Today',
      'Yesterday',
      'Previous 7 days',
      new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
        new Date(2026, 7, 5),
      ),
    ]);
    expect(groups[0]?.notes.map((n) => n.id)).toEqual(['pinned']);
  });
});

describe('filterNotes', () => {
  const notes = [
    note('a', NOW, { title: 'Groceries', plainText: 'milk and eggs' }),
    note('b', NOW, { title: 'Launch', plainText: 'ship the brown fox' }),
  ];
  it('matches every word across title and text, ignoring case', () => {
    expect(filterNotes(notes, 'MILK groceries').map((n) => n.id)).toEqual(['a']);
    expect(filterNotes(notes, 'fox launch').map((n) => n.id)).toEqual(['b']);
    expect(filterNotes(notes, 'fox milk')).toEqual([]);
    expect(filterNotes(notes, '  ')).toHaveLength(2);
  });
});

describe('snippet', () => {
  it('centres on the first match', () => {
    const text = `${'word '.repeat(30)}needle and more`;
    const result = snippet(text, 'needle', 40);
    expect(result.startsWith('…')).toBe(true);
    expect(result).toContain('needle');
  });
});

describe('snippet block joins', () => {
  it('separates blocks that do not end in punctuation', () => {
    expect(snippet('Done.\n\nNext steps\nShip it\nTell the team', '')).toBe(
      'Done. Next steps · Ship it · Tell the team',
    );
  });
});
