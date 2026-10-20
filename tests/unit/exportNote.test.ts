import { describe, expect, it } from 'vitest';
import { fileNameFor } from '../../src/features/notes/exportNote';

const createdAt = new Date(2026, 9, 20, 12).getTime();

describe('fileNameFor', () => {
  it('slugs the title and adds the date', () => {
    expect(fileNameFor('Hello, World!', createdAt, 'md')).toBe('hello-world-2026-10-20.md');
  });

  it('falls back to "note" when the title has only symbols', () => {
    expect(fileNameFor('!!! ???', createdAt, 'txt')).toBe('note-2026-10-20.txt');
  });

  it('caps the slug at 50 characters without a trailing dash', () => {
    const name = fileNameFor('a'.repeat(40) + ' ' + 'b'.repeat(40), createdAt, 'md');
    const slug = name.replace(/-2026-10-20\.md$/, '');
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug.endsWith('-')).toBe(false);
  });
});
