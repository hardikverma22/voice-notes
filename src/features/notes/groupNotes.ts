import type { Note } from '../../storage/db';

export interface NoteGroup {
  label: string;
  notes: Note[];
}

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/** Pinned first, then Today / Yesterday / Previous 7 days / one group per month. */
export function groupNotes(notes: Note[], now = Date.now()): NoteGroup[] {
  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  const week = today - 7 * 86_400_000;
  const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

  const groups = new Map<string, Note[]>();
  const push = (label: string, note: Note) => {
    const list = groups.get(label);
    if (list) list.push(note);
    else groups.set(label, [note]);
  };

  for (const note of notes) {
    if (note.pinned) push('Pinned', note);
  }
  for (const note of notes) {
    if (note.pinned) continue;
    const t = note.createdAt;
    if (t >= today) push('Today', note);
    else if (t >= yesterday) push('Yesterday', note);
    else if (t >= week) push('Previous 7 days', note);
    else push(monthFormat.format(t), note);
  }
  return [...groups].map(([label, list]) => ({ label, notes: list }));
}

/** Case-insensitive match on title and text. Every word of the query must appear. */
export function filterNotes(notes: Note[], query: string): Note[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return notes;
  return notes.filter((note) => {
    const haystack = `${note.title}\n${note.plainText}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

/** A short excerpt of the text around the first match, or the start of the text. */
export function snippet(text: string, query: string, length = 140): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const word = query.toLowerCase().split(/\s+/).find(Boolean);
  if (!word) return clean.slice(0, length);
  const at = clean.toLowerCase().indexOf(word);
  if (at < 0) return clean.slice(0, length);
  const start = Math.max(0, at - Math.min(40, Math.floor(length / 3)));
  return `${start > 0 ? '…' : ''}${clean.slice(start, start + length)}`;
}

/** Time for today's notes, short date otherwise. */
export function listTime(time: number, now = Date.now()): string {
  if (time >= startOfDay(now)) {
    return new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(time);
  }
  const sameYear = new Date(time).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(time);
}
