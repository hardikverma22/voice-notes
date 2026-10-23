import { AnimatePresence, m } from 'motion/react';
import { useState } from 'react';
import { noteHref } from '../../app/router';
import { Segmented } from '../../design/components/Segmented';
import { useToast } from '../../design/components/useToast';
import { ArrowRightIcon, CheckIcon, ListChecksIcon } from '../../design/icons';
import { listTime } from '../notes/groupNotes';
import { toggleTask, type TaskRef } from './tasks';
import { useNoteTasks } from './useTasks';

type View = 'open' | 'done';

/**
 * Every checklist item across the notes, grouped by note. Ticking one here changes it in the
 * note itself; there is no separate task list to keep in sync.
 */
export default function TasksPage() {
  const entries = useNoteTasks();
  const [view, setView] = useState<View>('open');
  const toast = useToast();

  const all = entries ?? [];
  const openCount = all.reduce((n, e) => n + e.tasks.filter((t) => !t.checked).length, 0);
  const doneCount = all.reduce((n, e) => n + e.tasks.filter((t) => t.checked).length, 0);
  const groups = all
    .map((entry) => ({
      ...entry,
      tasks: entry.tasks.filter((task) => task.checked === (view === 'done')),
    }))
    .filter((entry) => entry.tasks.length > 0);

  async function toggle(noteId: string, task: TaskRef) {
    const checked = !task.checked;
    const ok = await toggleTask(noteId, task, checked);
    if (!ok) {
      toast.show({ tone: 'error', message: 'That note changed. Open it to update the task.' });
      return;
    }
    toast.show({
      message: checked ? `Done: ${task.text}` : `Reopened: ${task.text}`,
      durationMs: 4000,
      actions: [
        { label: 'Undo', onClick: () => void toggleTask(noteId, { ...task, checked }, !checked) },
      ],
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 pb-24 sm:px-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight sm:text-4xl">Tasks</h1>
          <p className="mt-1.5 max-w-lg text-sm text-balance text-fg-muted">
            Checklist items from all your notes. Tick them off here or inside the note.
          </p>
        </div>
        <Segmented<View>
          label="Show"
          value={view}
          onChange={setView}
          options={[
            { value: 'open', label: `Open · ${openCount}` },
            { value: 'done', label: `Done · ${doneCount}` },
          ]}
        />
      </header>

      {entries === undefined ? (
        <div className="mt-8 flex flex-col gap-3" aria-hidden="true">
          <div className="vn-shimmer h-28 rounded-lg" />
          <div className="vn-shimmer h-20 rounded-lg" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyTasks view={view} hasAny={openCount + doneCount > 0} />
      ) : (
        <div className="mt-8 flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {groups.map(({ note, tasks }) => (
              <m.section
                key={note.id}
                layout="position"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                aria-label={note.title || 'Untitled note'}
                className="rounded-lg border border-border bg-surface shadow-sm"
              >
                <a
                  href={noteHref(note.id)}
                  className="group flex items-baseline justify-between gap-3 rounded-t-lg border-b border-border px-4 py-3 transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus"
                >
                  <span className="min-w-0 truncate font-semibold">
                    {note.title || 'Untitled note'}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-fg-muted">
                    <span className="tabular">{listTime(note.createdAt)}</span>
                    <ArrowRightIcon
                      aria-hidden="true"
                      className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </a>
                <ul className="flex flex-col p-1.5">
                  <AnimatePresence initial={false}>
                    {tasks.map((task) => (
                      <m.li
                        key={`${task.index}:${task.text}`}
                        layout="position"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, x: 12, transition: { duration: 0.15 } }}
                      >
                        <TaskRow task={task} onToggle={() => void toggle(note.id, task)} />
                      </m.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </m.section>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle }: { task: TaskRef; onToggle: () => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2.5 py-2.5 transition-colors hover:bg-surface-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
      <input type="checkbox" checked={task.checked} onChange={onToggle} className="peer sr-only" />
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[0.35rem] border-2 transition-colors ${task.checked ? 'border-accent bg-accent text-accent-fg' : 'border-control bg-surface'}`}
      >
        {task.checked ? <CheckIcon weight="bold" className="size-3" /> : null}
      </span>
      <span className={`leading-snug ${task.checked ? 'text-fg-muted line-through' : ''}`}>
        {task.text}
      </span>
    </label>
  );
}

function EmptyTasks({ view, hasAny }: { view: View; hasAny: boolean }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        <ListChecksIcon aria-hidden="true" className="size-6" />
      </span>
      <p className="font-medium">
        {view === 'done' ? 'Nothing ticked off yet' : hasAny ? 'All done' : 'No tasks yet'}
      </p>
      <p className="max-w-sm text-sm text-fg-muted text-pretty">
        {view === 'done'
          ? 'Tasks you complete appear here.'
          : 'In any note, type [ ] and a space, or use the checklist button in the toolbar. Every checklist item shows up here.'}
      </p>
    </div>
  );
}
