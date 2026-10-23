import { db, type Note } from '../../storage/db';

/**
 * Tasks are the checklist items people write in notes (Tiptap taskItem nodes). They stay in
 * the notes; the Tasks page only reads them and flips their checked state in place.
 */

export interface TaskRef {
  /** Position among the note's task items, in document order. Identifies the item for toggling. */
  index: number;
  text: string;
  checked: boolean;
}

interface Node {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: Node[];
}

function textOf(node: Node, skipTaskLists: boolean): string {
  if (node.type === 'text') return node.text ?? '';
  if (skipTaskLists && node.type === 'taskList') return '';
  return (node.content ?? []).map((child) => textOf(child, skipTaskLists)).join(' ');
}

function parse(contentJson: string): Node | null {
  try {
    return JSON.parse(contentJson) as Node;
  } catch {
    return null;
  }
}

/** Every task item in document order, nested ones included. Text excludes nested sub-tasks. */
export function extractTasks(contentJson: string): TaskRef[] {
  const tasks: TaskRef[] = [];
  const walk = (node: Node) => {
    if (node.type === 'taskItem') {
      const text = textOf({ content: node.content }, true).replace(/\s+/g, ' ').trim();
      tasks.push({ index: tasks.length, text, checked: node.attrs?.checked === true });
    }
    for (const child of node.content ?? []) walk(child);
  };
  const doc = parse(contentJson);
  if (doc) walk(doc);
  return tasks;
}

/** Returns the doc with one task item's checked state changed, or null if it is not there. */
export function setTaskChecked(
  contentJson: string,
  index: number,
  checked: boolean,
): string | null {
  const doc = parse(contentJson);
  if (!doc) return null;
  let seen = 0;
  let found = false;
  const walk = (node: Node) => {
    if (found) return;
    if (node.type === 'taskItem') {
      if (seen === index) {
        node.attrs = { ...node.attrs, checked };
        found = true;
        return;
      }
      seen++;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return found ? JSON.stringify(doc) : null;
}

/** Ticks or unticks a task in its note. Checks the text still matches, in case the note changed. */
export async function toggleTask(
  noteId: string,
  task: TaskRef,
  checked: boolean,
  database = db,
): Promise<boolean> {
  return database.transaction('rw', database.notes, async () => {
    const note = await database.notes.get(noteId);
    if (!note) return false;
    const current = extractTasks(note.contentJson)[task.index];
    if (!current || current.text !== task.text) return false;
    const next = setTaskChecked(note.contentJson, task.index, checked);
    if (!next) return false;
    await database.notes.update(noteId, { contentJson: next, updatedAt: Date.now() });
    return true;
  });
}

export interface NoteTasks {
  note: Note;
  tasks: TaskRef[];
}

/** Notes that have tasks, newest note first. Empty task items are skipped. */
export function collectTasks(notes: Note[]): NoteTasks[] {
  return notes
    .map((note) => ({ note, tasks: extractTasks(note.contentJson).filter((t) => t.text) }))
    .filter((entry) => entry.tasks.length > 0)
    .sort((a, b) => b.note.createdAt - a.note.createdAt);
}
