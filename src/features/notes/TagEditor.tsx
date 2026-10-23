import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useRef, useState } from 'react';
import { PlusIcon, XIcon } from '../../design/icons';
import { addTag, MAX_TAG_LENGTH, normalizeTag } from '../../lib/tags';

const MAX_SUGGESTIONS = 6;

/**
 * Tags on a note: removable chips plus an inline combobox. Enter or comma adds the typed tag,
 * the arrow keys pick one already used on other notes, Backspace on an empty field removes the
 * last tag. Changes are saved straight away through onChange.
 */
export function TagEditor({
  tags,
  allTags,
  onChange,
}: {
  tags: string[];
  /** Every tag in the library, most used first, for suggestions. */
  allTags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  // The saved list arrives back asynchronously; quick successive edits build on this instead.
  const latestRef = useRef(tags);
  useEffect(() => {
    latestRef.current = tags;
  }, [tags]);

  function save(next: string[]) {
    latestRef.current = next;
    onChange(next);
  }

  const typed = normalizeTag(value).toLowerCase();
  const taken = new Set(tags.map((tag) => tag.toLowerCase()));
  const suggestions = allTags
    .filter((tag) => !taken.has(tag.toLowerCase()) && tag.toLowerCase().includes(typed))
    .slice(0, MAX_SUGGESTIONS);
  const open = editing && suggestions.length > 0;

  function commit(raw: string) {
    const current = latestRef.current;
    const next = addTag(current, raw);
    if (next !== current) save(next);
    setValue('');
    setHighlight(-1);
  }

  function close() {
    setEditing(false);
    setValue('');
    setHighlight(-1);
  }

  function remove(tag: string) {
    save(latestRef.current.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tags">
      <AnimatePresence initial={false} mode="popLayout">
        {tags.map((tag) => (
          <m.span
            key={tag}
            layout="position"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.12 } }}
            className="inline-flex h-8 max-w-full items-center gap-0.5 rounded-full bg-surface-2 pr-1 pl-3 text-xs font-medium"
          >
            <span className="min-w-0 truncate" title={tag}>
              <span aria-hidden="true" className="text-fg-muted">
                #
              </span>
              {tag}
            </span>
            <button
              type="button"
              onClick={() => remove(tag)}
              aria-label={`Remove tag ${tag}`}
              className="flex size-6 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-bg hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
            >
              <XIcon aria-hidden="true" weight="bold" className="size-3" />
            </button>
          </m.span>
        ))}
      </AnimatePresence>

      {editing ? (
        <div className="relative">
          <input
            ref={inputRef}
            autoFocus
            value={value}
            maxLength={MAX_TAG_LENGTH + 1}
            onChange={(event) => {
              const next = event.target.value;
              if (next.endsWith(',')) commit(next.slice(0, -1));
              else {
                setValue(next);
                setHighlight(-1);
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && suggestions.length) {
                event.preventDefault();
                setHighlight((h) => (h + 1) % suggestions.length);
              } else if (event.key === 'ArrowUp' && suggestions.length) {
                event.preventDefault();
                setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const picked = suggestions[highlight];
                if (picked) commit(picked);
                else if (value.trim()) commit(value);
                else close();
              } else if (event.key === 'Escape') {
                event.stopPropagation();
                close();
                requestAnimationFrame(() => addRef.current?.focus());
              } else if (event.key === 'Backspace' && !value && latestRef.current.length) {
                remove(latestRef.current[latestRef.current.length - 1]!);
              }
            }}
            onBlur={() => {
              if (value.trim()) commit(value);
              close();
            }}
            role="combobox"
            aria-label="Add a tag"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={highlight >= 0 ? `${listId}-${highlight}` : undefined}
            placeholder="Tag name"
            enterKeyHint="done"
            autoCapitalize="none"
            spellCheck={false}
            className="h-8 w-36 rounded-full border border-accent bg-surface px-3 text-base outline-none ring-3 ring-accent/15 placeholder:text-fg-muted sm:text-xs"
          />
          {open ? (
            <ul
              id={listId}
              role="listbox"
              aria-label="Tags used on other notes"
              className="absolute top-full left-0 z-30 mt-1.5 max-h-56 w-48 overflow-y-auto rounded-md border border-border bg-surface p-1 shadow-md"
            >
              {suggestions.map((tag, index) => (
                <li
                  key={tag}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === highlight}
                  // Keep focus in the input so blur does not close the list first.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(tag)}
                  className="flex min-h-9 cursor-pointer items-center truncate rounded-sm px-2.5 text-sm aria-selected:bg-accent-soft aria-selected:text-fg hover:bg-surface-2"
                >
                  <span aria-hidden="true" className="mr-0.5 text-fg-muted">
                    #
                  </span>
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <button
          ref={addRef}
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed border-control/60 px-3 text-xs font-medium text-fg-muted transition-colors hover:border-control hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus"
        >
          <PlusIcon aria-hidden="true" weight="bold" className="size-3" />
          {tags.length ? 'Tag' : 'Add tag'}
        </button>
      )}
    </div>
  );
}
