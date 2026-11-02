import { formatDuration } from '../../lib/format';
import type { Segment } from '../transcribe/protocol';

/**
 * The hand-off report for a screen recording: what an AI coding agent (or a teammate) needs
 * to act on it. Markdown for agents, and one self-contained HTML page for people. Pure
 * functions; exportBundle.ts gathers the images and zips everything.
 */

export interface ReportFrame {
  /** Path inside the bundle, e.g. "frames/03-1m12s.webp". */
  file: string;
  t: number;
  marked: boolean;
  /** What was said while this frame was on screen. */
  text: string;
  /** Text read from the frame itself (error messages, code, labels), if any. */
  screenText?: string;
  /** For the HTML page: the image inlined as a data: URL. */
  dataUrl?: string;
}

export interface ReportInput {
  title: string;
  createdAt: number;
  durationMs: number;
  /** The note body as Markdown, as the person edited it. */
  noteMarkdown: string;
  frames: ReportFrame[];
  segments: Segment[];
  bookmarks: { t: number; label: string }[];
  /** The final transcript was not written yet when this was exported. */
  transcriptPending?: boolean;
  /** Path of the audio inside the bundle, and for the HTML page a data: URL to play it. */
  audio?: { file: string; dataUrl?: string };
}

/**
 * "frames/03-1m12s.webp": tells the moment at a glance, and sorts in time order. The number is
 * padded to the width of the frame count, so frame 100 sorts after frame 99.
 */
export function frameFileName(index: number, t: number, ext: string, count = 1): string {
  const seconds = Math.max(0, Math.floor(t));
  const stamp = `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
  const width = Math.max(2, String(count).length);
  return `frames/${String(index + 1).padStart(width, '0')}-${stamp}.${ext}`;
}

export function extensionForImage(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

const clock = (t: number) => formatDuration(t * 1000);

/** Longest screen text kept per frame in the report; screenshots of long pages can run on. */
const MAX_SCREEN_TEXT = 2000;

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_SCREEN_TEXT ? `${trimmed.slice(0, MAX_SCREEN_TEXT)}\n…` : trimmed;
}

const PENDING =
  'The transcript was still being written when this was exported, so some speech may be missing. The audio is complete.';

function dateLine(createdAt: number): string {
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(
    createdAt,
  );
}

function summaryLine(input: ReportInput): string {
  const parts = [dateLine(input.createdAt)];
  if (input.durationMs > 0) parts.push(formatDuration(input.durationMs));
  if (input.frames.length > 0) {
    parts.push(`${input.frames.length} ${input.frames.length === 1 ? 'frame' : 'frames'}`);
  }
  return parts.join(' · ');
}

/** Blockquotes every line, so a transcript with line breaks stays one quote. */
function quote(text: string): string {
  return text
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

export function buildReportMarkdown(input: ReportInput): string {
  const title = input.title.trim() || 'Screen recording';
  const marked = input.frames.some((frame) => frame.marked);
  const out: string[] = [`# ${title}`, '', `_${summaryLine(input)}_`, ''];
  if (input.transcriptPending) out.push(`> **Note:** ${PENDING}`, '');

  if (input.frames.length > 0) {
    out.push(
      '<!-- For AI agents: this is a narrated screen recording. Each frame below is followed by',
      'what the person said while it was on screen, so read them together. The notes section is',
      'their own summary and takes priority where it differs from the transcript.' +
        (marked
          ? ' Coloured arrows, boxes and highlights were drawn by the person to point at something.'
          : '') +
        (input.frames.some((frame) => frame.screenText?.trim())
          ? ' "Text on screen" was read from the frame by OCR and may contain small errors.'
          : '') +
        ' -->',
      '',
    );
  }

  const notes = input.noteMarkdown.trim();
  if (notes) out.push('## Notes', '', notes, '');

  if (input.frames.length > 0) {
    out.push('## Walkthrough', '');
    input.frames.forEach((frame, index) => {
      out.push(
        `### ${index + 1}. At ${clock(frame.t)}${frame.marked ? ' (marked up)' : ''}`,
        '',
        `![Frame ${index + 1} at ${clock(frame.t)}](${frame.file})`,
        '',
      );
      if (frame.text) out.push(quote(frame.text), '');
      if (frame.screenText?.trim()) {
        // A fence longer than any backtick run inside, so code on screen cannot close it.
        const longest = Math.max(2, ...(frame.screenText.match(/`+/g) ?? []).map((m) => m.length));
        const fence = '`'.repeat(longest + 1);
        out.push('Text on screen:', '', `${fence}text`, clip(frame.screenText), fence, '');
      }
    });
  }

  if (input.bookmarks.length > 0) {
    out.push('## Marked moments', '');
    for (const bookmark of input.bookmarks) {
      out.push(`- ${clock(bookmark.t)}${bookmark.label ? ` — ${bookmark.label}` : ''}`);
    }
    out.push('');
  }

  const spoken = input.segments.filter((segment) => segment.text.trim());
  if (spoken.length > 0) {
    out.push('## Transcript', '');
    for (const segment of spoken) out.push(`[${clock(segment.start)}] ${segment.text.trim()}`);
    out.push('');
  }

  if (input.audio) out.push(`Audio: [${input.audio.file}](${input.audio.file})`, '');
  return out.join('\n');
}

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

/** Paragraphs of plain text, escaped. The note body is shown as text, not rendered Markdown. */
function paragraphs(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

/**
 * One HTML file with everything inlined (images and, when small enough, audio), so it opens
 * anywhere with no server and no network. Timestamps seek the embedded audio.
 */
export function buildReportHtml(input: ReportInput): string {
  const title = escapeHtml(input.title.trim() || 'Screen recording');
  // Inlined when small enough; otherwise the audio file next to report.html in the bundle.
  const audio = input.audio ? (input.audio.dataUrl ?? input.audio.file) : undefined;
  const seek = (t: number) =>
    audio
      ? `<button class="t" type="button" data-t="${Math.max(0, t - 1).toFixed(1)}">${clock(t)}</button>`
      : `<span class="t">${clock(t)}</span>`;

  const frames = input.frames
    .map(
      (frame, index) => `<section class="frame" id="frame-${index + 1}">
  <header>${seek(frame.t)}<h2>Frame ${index + 1}${frame.marked ? ' <span class="tag">marked up</span>' : ''}</h2></header>
  <img src="${escapeHtml(frame.dataUrl ?? frame.file)}" alt="Frame ${index + 1} at ${clock(frame.t)}" loading="lazy">
  ${frame.text ? `<blockquote>${escapeHtml(frame.text)}</blockquote>` : '<p class="muted">Nothing was said here.</p>'}
  ${frame.screenText?.trim() ? `<details><summary>Text on screen</summary><pre>${escapeHtml(clip(frame.screenText))}</pre></details>` : ''}
</section>`,
    )
    .join('\n');

  const transcript = input.segments
    .filter((segment) => segment.text.trim())
    .map((segment) => `<li>${seek(segment.start)} ${escapeHtml(segment.text.trim())}</li>`)
    .join('\n');

  const notes = input.noteMarkdown.trim();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
:root{--bg:#f7f5f1;--fg:#1f1d1a;--muted:#6b665e;--card:#fff;--line:#e4dfd6;--accent:#0d6463}
@media (prefers-color-scheme:dark){:root{--bg:#141312;--fg:#ece8e1;--muted:#a39d93;--card:#1d1c1a;--line:#33302c;--accent:#5fb8b4}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px 96px}
h1{font:600 2rem/1.2 Georgia,"Times New Roman",serif;margin:0 0 4px}h2{font-size:1rem;margin:0}
.muted{color:var(--muted)}.meta{color:var(--muted);margin:0 0 24px}
.card,.frame{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:16px 0}
.frame header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.frame img{display:block;width:100%;height:auto;border-radius:8px;border:1px solid var(--line)}
blockquote{margin:12px 0 0;padding:0 0 0 14px;border-left:3px solid var(--accent)}
.t{font:500 .8rem/1 ui-monospace,monospace;color:var(--accent);background:none;border:1px solid var(--line);border-radius:999px;padding:5px 9px}
button.t{cursor:pointer}button.t:hover{background:var(--bg)}
.tag{font-size:.75rem;font-weight:500;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:2px 8px;margin-left:6px}
audio{width:100%;position:sticky;top:8px;z-index:1}
ol{list-style:none;padding:0;margin:0}ol li{padding:4px 0}
footer{margin-top:48px;color:var(--muted);font-size:.85rem}
details{margin-top:12px}summary{cursor:pointer;color:var(--muted);font-size:.9rem}
pre{white-space:pre-wrap;font:.85rem/1.5 ui-monospace,monospace;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:10px;margin:8px 0 0}
</style>
</head>
<body>
<main>
<h1>${title}</h1>
<p class="meta">${escapeHtml(summaryLine(input))}</p>
${input.transcriptPending ? `<p class="card muted">${PENDING}</p>` : ''}
${audio ? `<audio id="audio" controls preload="metadata" src="${escapeHtml(audio)}"></audio>` : ''}
${notes ? `<section class="card"><h2>Notes</h2>${paragraphs(notes)}</section>` : ''}
${frames}
${transcript ? `<section class="card"><h2>Transcript</h2><ol>${transcript}</ol></section>` : ''}
<footer>Made with Voice Notes. Recorded and transcribed on the author's device.</footer>
</main>
${audio ? `<script>document.addEventListener('click',function(e){var b=e.target.closest('button.t');if(!b)return;var a=document.getElementById('audio');a.currentTime=Number(b.dataset.t);a.play();});</script>` : ''}
</body>
</html>
`;
}
