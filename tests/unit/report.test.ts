import { describe, expect, it } from 'vitest';
import {
  buildReportHtml,
  buildReportMarkdown,
  escapeHtml,
  frameFileName,
  type ReportInput,
} from '../../src/features/screen/report';

const input = (overrides: Partial<ReportInput> = {}): ReportInput => ({
  title: 'Checkout button does nothing',
  createdAt: new Date(2026, 10, 1, 9, 30).getTime(),
  durationMs: 74_000,
  noteMarkdown: 'Clicking **Pay** on the cart page does nothing.',
  frames: [
    { file: 'frames/01-0m03s.webp', t: 3, marked: false, text: 'This is the cart.' },
    { file: 'frames/02-0m41s.webp', t: 41, marked: true, text: 'I click pay here.' },
  ],
  segments: [
    { start: 1, end: 3, text: ' This is the cart. ' },
    { start: 40, end: 42, text: 'I click pay here.' },
  ],
  bookmarks: [{ t: 41, label: 'the bug' }],
  audio: { file: 'audio.webm' },
  ...overrides,
});

describe('frameFileName', () => {
  it('numbers frames and stamps the moment', () => {
    expect(frameFileName(0, 3.9, 'webp')).toBe('frames/01-0m03s.webp');
    expect(frameFileName(11, 125, 'jpg')).toBe('frames/12-2m05s.jpg');
  });

  it('pads to the frame count, so names sort in time order past 99 frames', () => {
    const names = [10, 99, 100].map((i) => frameFileName(i, i * 4, 'webp', 300));
    expect(names).toEqual([
      'frames/011-0m40s.webp',
      'frames/100-6m36s.webp',
      'frames/101-6m40s.webp',
    ]);
    expect([...names].sort()).toEqual(names);
  });
});

describe('report.md', () => {
  const md = buildReportMarkdown(input());

  it('puts the notes first, then each frame with what was said', () => {
    expect(md.startsWith('# Checkout button does nothing\n')).toBe(true);
    expect(md).toContain('_Nov 1, 2026, 9:30 AM · 1:14 · 2 frames_');
    expect(md.indexOf('## Notes')).toBeLessThan(md.indexOf('## Walkthrough'));
    expect(md).toContain(
      '### 2. At 0:41 (marked up)\n\n![Frame 2 at 0:41](frames/02-0m41s.webp)\n\n> I click pay here.',
    );
  });

  it('tells agents how to read it, including the drawn marks', () => {
    expect(md).toContain('For AI agents');
    expect(md).toContain('drawn by the person');
  });

  it('lists marked moments, the timestamped transcript and the audio', () => {
    expect(md).toContain('- 0:41 — the bug');
    expect(md).toContain('[0:01] This is the cart.');
    expect(md).toContain('Audio: [audio.webm](audio.webm)');
  });

  it('leaves out empty sections, and the agent note when there are no frames', () => {
    const bare = buildReportMarkdown(
      input({ frames: [], noteMarkdown: ' ', bookmarks: [], segments: [], audio: undefined }),
    );
    expect(bare).not.toMatch(/## |For AI agents|Audio:/);
    expect(bare).toContain('# Checkout button does nothing');
  });

  it('warns when the transcript was not finished', () => {
    expect(buildReportMarkdown(input({ transcriptPending: true }))).toContain(
      '> **Note:** The transcript was still being written',
    );
    expect(md).not.toContain('still being written');
  });

  it('keeps a multi-line utterance inside one quote', () => {
    const md2 = buildReportMarkdown(
      input({ frames: [{ file: 'f.webp', t: 0, marked: false, text: 'one\ntwo' }] }),
    );
    expect(md2).toContain('> one\n> two');
  });
});

describe('report.html', () => {
  it('escapes everything the person wrote', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
    const html = buildReportHtml(
      input({
        title: '<script>alert(1)</script>',
        noteMarkdown: '<img src=x onerror=alert(1)>',
        frames: [{ file: 'f.webp', t: 0, marked: false, text: '</blockquote><script>' }],
      }),
    );
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;/blockquote&gt;&lt;script&gt;');
  });

  it('inlines images and makes timestamps seek when the audio is embedded', () => {
    const html = buildReportHtml(
      input({
        frames: [
          {
            file: 'f.webp',
            t: 41,
            marked: true,
            text: 'here',
            dataUrl: 'data:image/webp;base64,AAA',
          },
        ],
        audio: { file: 'audio.webm', dataUrl: 'data:audio/webm;base64,BBB' },
      }),
    );
    expect(html).toContain('src="data:image/webp;base64,AAA"');
    expect(html).toContain('<audio id="audio"');
    expect(html).toContain('data-t="40.0">0:41</button>');
  });

  it('links the audio file next to the page when it was too big to inline', () => {
    const html = buildReportHtml(input({ audio: { file: 'audio.webm' } }));
    expect(html).toContain('<audio id="audio" controls preload="metadata" src="audio.webm">');
    expect(html).toContain('data-t="40.0">0:41</button>');
  });

  it('shows plain timestamps without audio', () => {
    const html = buildReportHtml(input({ audio: undefined }));
    expect(html).not.toContain('<audio');
    expect(html).not.toContain('<script>');
    expect(html).toContain('<span class="t">0:41</span>');
  });
});
