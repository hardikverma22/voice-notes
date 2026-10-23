import { useLiveQuery } from 'dexie-react-hooks';
import { listNotes } from '../../storage/notes';
import { collectTasks, type NoteTasks } from './tasks';

/** Notes with checklist items, kept live. undefined while loading. */
export function useNoteTasks(): NoteTasks[] | undefined {
  return useLiveQuery(async () => collectTasks(await listNotes()), []);
}

export function useOpenTaskCount(): number {
  const entries = useNoteTasks();
  return (entries ?? []).reduce(
    (sum, entry) => sum + entry.tasks.filter((task) => !task.checked).length,
    0,
  );
}
