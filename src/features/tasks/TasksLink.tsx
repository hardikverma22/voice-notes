import { ListChecksIcon } from '../../design/icons';
import { useOpenTaskCount } from './useTasks';

/** Link to the Tasks page with the number of open checklist items. */
export function TasksLink({ active, variant }: { active: boolean; variant: 'nav' | 'chip' }) {
  const open = useOpenTaskCount();
  const label = `${open} open ${open === 1 ? 'task' : 'tasks'}`;
  if (variant === 'chip') {
    return (
      <a
        href="#/tasks"
        aria-label={`Tasks, ${label}`}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-xs font-medium shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        <ListChecksIcon aria-hidden="true" className="size-4" />
        Tasks
        {open > 0 ? <span className="tabular text-accent">{open}</span> : null}
      </a>
    );
  }
  return (
    <a
      href="#/tasks"
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-10 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${active ? 'bg-accent-soft text-fg' : 'text-fg-muted hover:bg-surface-2 hover:text-fg'}`}
    >
      <ListChecksIcon aria-hidden="true" className="size-4.5" />
      <span className="flex-1">Tasks</span>
      {open > 0 ? (
        <span className="tabular rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-fg">
          {open}
          <span className="sr-only"> open</span>
        </span>
      ) : null}
    </a>
  );
}
