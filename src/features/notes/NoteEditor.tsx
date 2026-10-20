import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import Highlight from '@tiptap/extension-highlight';
import { debounce } from '../../lib/debounce';
import { updateNoteContent } from '../../storage/notes';
import type { Note } from '../../storage/db';
import {
  CodeIcon,
  NotePencilIcon,
  HighlighterIcon,
  LinkSimpleIcon,
  ListBulletsIcon,
  ListChecksIcon,
  ListNumbersIcon,
  QuotesIcon,
  RedoIcon,
  TextBIcon,
  TextHOneIcon,
  TextHThreeIcon,
  TextHTwoIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
  UndoIcon,
  type Icon,
} from '../../design/icons';

const SAVE_DELAY_MS = 500;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface SavePayload {
  contentJson: string;
  plainText: string;
  title: string;
}

/**
 * Tiptap editor for one note. Parent passes a key so each note (and each transcript
 * version) gets a fresh editor. `locked` makes it read-only while transcription runs.
 */
export default function NoteEditor({
  note,
  locked,
  onEditor,
  onSaveStatus,
  afterTitle,
  hidden = false,
}: {
  note: Note;
  locked: boolean;
  onEditor: (editor: Editor | null) => void;
  onSaveStatus: (status: SaveStatus) => void;
  /** Rendered between the title and the editor (meta, player, tabs). */
  afterTitle?: ReactNode;
  /** Keeps the editor mounted (for export) while another tab is shown. */
  hidden?: boolean;
}) {
  const [title, setTitle] = useState(note.title);
  const titleRef = useRef(title);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  useEffect(() => {
    onSaveStatus(saveStatus);
  }, [saveStatus, onSaveStatus]);

  // Autosave: the payload is captured on every change, the write is debounced.
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
    editable: !locked,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
      Placeholder.configure({
        placeholder: locked
          ? 'Transcribing…'
          : 'Start typing here… Type # for a heading, - for a list, [ ] for a checklist.',
      }),
      Markdown,
    ],
    content: JSON.parse(note.contentJson) as Record<string, unknown>,
    editorProps: {
      attributes: {
        'aria-label': 'Note text',
        class: 'vn-prose min-h-56 outline-none',
      },
    },
    onUpdate: ({ editor: current }) => {
      setSaveStatus('saving');
      save({
        contentJson: JSON.stringify(current.getJSON()),
        plainText: current.getText(),
        title: titleRef.current,
      });
    },
  });

  useEffect(() => {
    onEditor(editor);
    return () => onEditor(null);
  }, [editor, onEditor]);

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

  // Auto-grow the title field; focus it for a brand-new empty note.
  useEffect(() => {
    const el = titleInputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);
  useEffect(() => {
    if (!note.title && !note.plainText && !locked) titleInputRef.current?.focus();
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onTitleChange(next: string) {
    const clean = next.replace(/\n/g, ' ');
    setTitle(clean);
    titleRef.current = clean;
    if (editor) {
      setSaveStatus('saving');
      save({
        contentJson: JSON.stringify(editor.getJSON()),
        plainText: editor.getText(),
        title: clean,
      });
    }
  }

  return (
    <div className="flex flex-col">
      <label className="sr-only" htmlFor="note-title">
        Title
      </label>
      <textarea
        ref={titleInputRef}
        id="note-title"
        rows={1}
        placeholder="Untitled note"
        value={title}
        readOnly={locked}
        onChange={(event) => onTitleChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            editor?.commands.focus('start');
          }
        }}
        className="w-full resize-none overflow-hidden bg-transparent font-serif text-3xl leading-tight font-medium tracking-tight text-balance outline-none placeholder:text-fg-muted/60 focus-visible:outline-none sm:text-4xl"
      />

      {afterTitle}

      <div
        hidden={hidden}
        className={`mt-2 rounded-lg border bg-surface shadow-sm transition-[border-color,box-shadow] duration-(--vn-dur-base) ${locked ? 'border-border' : 'border-border hover:border-control focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15'}`}
      >
        {editor && !locked ? <Toolbar editor={editor} /> : null}
        {editor && !locked ? <SelectionMenu editor={editor} /> : null}
        <div
          className={`px-5 py-5 sm:px-7 sm:py-6 ${locked ? 'opacity-70' : 'cursor-text'}`}
          onMouseDown={(event) => {
            // Clicking the padding or empty space below the text focuses the end of the note.
            if (!editor || locked || event.target !== event.currentTarget) return;
            event.preventDefault();
            editor.commands.focus('end');
          }}
        >
          <EditorContent editor={editor} />
        </div>
        {!locked ? (
          <p className="flex items-center gap-1.5 border-t border-border px-5 py-2.5 text-xs text-fg-muted sm:px-7">
            <NotePencilIcon aria-hidden="true" className="size-3.5" />
            Click anywhere above to edit. Changes save automatically. Select text for quick
            formatting.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function promptLink(editor: Editor) {
  const previous = (editor.getAttributes('link').href as string | undefined) ?? '';
  const url = window.prompt('Link address', previous || 'https://');
  if (url === null) return;
  if (url.trim() === '' || url === 'https://') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
  } else {
    editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  }
}

function useActiveMarks(editor: Editor) {
  return useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      highlight: e.isActive('highlight'),
      code: e.isActive('code'),
      link: e.isActive('link'),
      h1: e.isActive('heading', { level: 1 }),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      task: e.isActive('taskList'),
      quote: e.isActive('blockquote'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
}

function Toolbar({ editor }: { editor: Editor }) {
  const s = useActiveMarks(editor);
  const chain = () => editor.chain().focus();
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-14 z-20 flex items-center gap-0.5 overflow-x-auto rounded-t-lg border-b border-border bg-surface/95 px-2 py-1.5 backdrop-blur [scrollbar-width:none] lg:top-0"
    >
      <Tool
        icon={UndoIcon}
        label="Undo"
        onClick={() => chain().undo().run()}
        disabled={!s.canUndo}
      />
      <Tool
        icon={RedoIcon}
        label="Redo"
        onClick={() => chain().redo().run()}
        disabled={!s.canRedo}
      />
      <Divider />
      <Tool
        icon={TextHOneIcon}
        label="Heading 1"
        pressed={s.h1}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      />
      <Tool
        icon={TextHTwoIcon}
        label="Heading 2"
        pressed={s.h2}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      />
      <Tool
        icon={TextHThreeIcon}
        label="Heading 3"
        pressed={s.h3}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      />
      <Divider />
      <Tool
        icon={TextBIcon}
        label="Bold"
        shortcut="⌘B"
        pressed={s.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <Tool
        icon={TextItalicIcon}
        label="Italic"
        shortcut="⌘I"
        pressed={s.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <Tool
        icon={TextUnderlineIcon}
        label="Underline"
        shortcut="⌘U"
        pressed={s.underline}
        onClick={() => chain().toggleUnderline().run()}
      />
      <Tool
        icon={TextStrikethroughIcon}
        label="Strikethrough"
        pressed={s.strike}
        onClick={() => chain().toggleStrike().run()}
      />
      <Tool
        icon={HighlighterIcon}
        label="Highlight"
        pressed={s.highlight}
        onClick={() => chain().toggleHighlight().run()}
      />
      <Tool
        icon={CodeIcon}
        label="Inline code"
        pressed={s.code}
        onClick={() => chain().toggleCode().run()}
      />
      <Tool
        icon={LinkSimpleIcon}
        label="Link"
        pressed={s.link}
        onClick={() => promptLink(editor)}
      />
      <Divider />
      <Tool
        icon={ListBulletsIcon}
        label="Bulleted list"
        pressed={s.bullet}
        onClick={() => chain().toggleBulletList().run()}
      />
      <Tool
        icon={ListNumbersIcon}
        label="Numbered list"
        pressed={s.ordered}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <Tool
        icon={ListChecksIcon}
        label="Checklist"
        pressed={s.task}
        onClick={() => chain().toggleTaskList().run()}
      />
      <Tool
        icon={QuotesIcon}
        label="Quote"
        pressed={s.quote}
        onClick={() => chain().toggleBlockquote().run()}
      />
    </div>
  );
}

/** Small formatting bubble over a text selection. */
function SelectionMenu({ editor }: { editor: Editor }) {
  const s = useActiveMarks(editor);
  const chain = () => editor.chain().focus();
  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: 'bottom', offset: 10 }}
      className="z-40 flex items-center gap-0.5 rounded-full border border-border bg-surface p-1 shadow-lg"
    >
      <Tool
        icon={TextBIcon}
        label="Bold"
        pressed={s.bold}
        onClick={() => chain().toggleBold().run()}
      />
      <Tool
        icon={TextItalicIcon}
        label="Italic"
        pressed={s.italic}
        onClick={() => chain().toggleItalic().run()}
      />
      <Tool
        icon={TextUnderlineIcon}
        label="Underline"
        pressed={s.underline}
        onClick={() => chain().toggleUnderline().run()}
      />
      <Tool
        icon={HighlighterIcon}
        label="Highlight"
        pressed={s.highlight}
        onClick={() => chain().toggleHighlight().run()}
      />
      <Tool
        icon={LinkSimpleIcon}
        label="Link"
        pressed={s.link}
        onClick={() => promptLink(editor)}
      />
    </BubbleMenu>
  );
}

function Divider() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

function Tool({
  icon: IconComponent,
  label,
  shortcut,
  pressed,
  disabled,
  onClick,
}: {
  icon: Icon;
  label: string;
  shortcut?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={pressed}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-35 aria-pressed:bg-accent-soft aria-pressed:text-accent"
    >
      <IconComponent
        aria-hidden="true"
        className="size-[1.15rem]"
        weight={pressed ? 'bold' : 'regular'}
      />
    </button>
  );
}
