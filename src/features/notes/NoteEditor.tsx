import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { debounce } from '../../lib/debounce';
import { updateNoteContent } from '../../storage/notes';
import type { Note } from '../../storage/db';
import { Button } from '../../design/components/Button';
import { downloadText, fileNameFor } from './exportNote';

const SAVE_DELAY_MS = 500;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving…',
  saved: 'Saved on this device',
  error: 'Could not save. Keep typing to try again.',
};

interface SavePayload {
  contentJson: string;
  plainText: string;
  title: string;
}

/** Tiptap editor for one note. Parent passes key={note.id} so each note gets a fresh editor. */
export default function NoteEditor({ note }: { note: Note }) {
  const [title, setTitle] = useState(note.title);
  const titleRef = useRef(title);

  // Autosave: the payload is captured on every change, the write is debounced.
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const save = useMemo(
    () =>
      debounce((payload: SavePayload) => {
        setSaveStatus('saving');
        updateNoteContent(note.id, payload)
          .then(() => setSaveStatus('saved'))
          .catch(() => setSaveStatus('error'));
      }, SAVE_DELAY_MS),
    [note.id],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Placeholder.configure({ placeholder: 'Start typing…' }),
      Markdown,
    ],
    content: JSON.parse(note.contentJson) as Record<string, unknown>,
    editorProps: {
      attributes: {
        'aria-label': 'Note text',
        class:
          'min-h-48 rounded-md bg-surface p-4 leading-(--vn-leading-body) outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus [&_h2]:mt-4 [&_h2]:font-serif [&_h2]:text-xl [&_h3]:font-serif [&_h3]:text-lg [&_ul]:list-disc [&_ul]:pl-6 [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-fg-muted [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
      },
    },
    onUpdate: ({ editor: current }) => {
      save({
        contentJson: JSON.stringify(current.getJSON()),
        plainText: current.getText(),
        title: titleRef.current,
      });
    },
  });

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current?.isActive('bold') ?? false,
      italic: current?.isActive('italic') ?? false,
      heading: current?.isActive('heading', { level: 2 }) ?? false,
      list: current?.isActive('bulletList') ?? false,
    }),
  });

  // Flush pending writes when the page is hidden or unloaded, and on unmount.
  useEffect(() => {
    const flush = () => save.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      save.flush();
    };
  }, [save]);

  function onTitleChange(next: string) {
    setTitle(next);
    titleRef.current = next;
    if (editor) {
      save({
        contentJson: JSON.stringify(editor.getJSON()),
        plainText: editor.getText(),
        title: next,
      });
    }
  }

  function exportAs(ext: 'md' | 'txt') {
    if (!editor) return;
    const text = ext === 'md' ? editor.getMarkdown() : editor.getText();
    const mime = ext === 'md' ? 'text/markdown' : 'text/plain';
    save.flush();
    downloadText(fileNameFor(titleRef.current, note.createdAt, ext), text, `${mime};charset=utf-8`);
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="sr-only" htmlFor="note-title">
        Title
      </label>
      <input
        id="note-title"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        className="w-full bg-transparent font-serif text-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />

      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap gap-2">
        <ToolbarButton
          label="Bold"
          pressed={toolbar?.bold ?? false}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          label="Italic"
          pressed={toolbar?.italic ?? false}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          label="Heading"
          pressed={toolbar?.heading ?? false}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolbarButton>
        <ToolbarButton
          label="Bulleted list"
          pressed={toolbar?.list ?? false}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          • List
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />

      <p role="status" aria-live="polite" className="min-h-5 text-xs text-fg-muted">
        {SAVE_LABEL[saveStatus]}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => exportAs('md')}>
          Export .md
        </Button>
        <Button variant="secondary" onClick={() => exportAs('txt')}>
          Export .txt
        </Button>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      onClick={onClick}
      className="min-h-11 min-w-11 rounded-md border border-control px-3 text-sm aria-pressed:bg-accent aria-pressed:text-accent-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {children}
    </button>
  );
}
