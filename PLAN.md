# Voice Notes: Plan

A private, offline-first voice notes app. You speak, Whisper transcribes on your device, and notes stay in your browser. Nothing is uploaded.

Reference: [addyosmani/say](https://github.com/addyosmani/say) (MIT). We borrow the idea and the flow, not the code. `say` is dated: it uses `@xenova/transformers` v2, Vite 4, TinyMCE (needs an API key), and has a leftover Chrome content script.

---

## 0. Read this first (rules for the executing model)

1. Work through milestones **in order** (M0, M1, ... M8). Do not start a milestone until every "Done when" item of the previous one is true.
2. Inside a milestone, do the steps **in the numbered order**. Each step names the exact files. Create only those files.
3. After each milestone, run its **Acceptance** commands exactly as written. If any fails, fix it before moving on. Never edit a test just to make it pass unless the step tells you to.
4. At the end of each milestone, go through its **On-track checklist**, then stop and report to the user: what you did, the command output summary, and anything you could not do. **Ask before committing.**
5. When this plan gives a file's contents verbatim (in a code block marked `verbatim`), copy them exactly. When it gives a spec, follow the spec. Do not "improve" verbatim files.
6. If something in this plan turns out to be wrong (an API does not exist, a command fails for a reason the plan did not predict), stop, explain what happened, and ask. Do not guess around it, and do not install extra packages to work around it.
7. All paths are relative to the project root `/Users/hardik/Projects/voice-notes`.

### Do NOT (hard rules)

| #   | Do NOT                                                                                                                                                          | Why                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Add TinyMCE, CKEditor, Quill, or any editor other than Tiptap                                                                                                   | Tiptap is decided; TinyMCE needs an API key                                                                                      |
| 2   | Install any package not listed in section 3, or a different version                                                                                             | Versions are verified together; extra packages break the bundle budget and the plan                                              |
| 3   | Use `@xenova/transformers` (the v2 package name)                                                                                                                | It is the old package. Use `@huggingface/transformers@4.3.1`                                                                     |
| 4   | Import `@huggingface/transformers` anywhere except `src/workers/whisper.worker.ts`                                                                              | Inference must never run on (or be bundled into) the main thread                                                                 |
| 5   | Store audio, transcripts, or notes in `localStorage` / `sessionStorage`                                                                                         | Size limits and synchronous I/O. Only the theme preference may go in `localStorage`                                              |
| 6   | Run `npm create vite`, `create-react-app`, or any interactive scaffolder                                                                                        | Interactive prompts hang; it would overwrite `PLAN.md`. Write files by hand as listed                                            |
| 7   | Run `git commit`, `git push`, or create branches without the user asking                                                                                        | User decides when to commit                                                                                                      |
| 8   | Edit or create files outside `/Users/hardik/Projects/voice-notes` (except the npm cache and Playwright's browser cache, which npm/Playwright manage themselves) | Scope                                                                                                                            |
| 9   | Precache model files (`*.onnx`, `*.onnx_data`) or ORT `*.wasm` in the service worker                                                                            | They are 70 to 200 MB. transformers.js caches them itself                                                                        |
| 10  | Add `runtimeCaching` rules for `huggingface.co`, `hf.co`, or `cdn.jsdelivr.net`                                                                                 | Double-caches the model in two places                                                                                            |
| 11  | Download random audio from the internet for tests                                                                                                               | Fixtures are generated by `scripts/make-fixture.mjs`                                                                             |
| 12  | Approve npm install scripts (`npm approve-scripts ...`) for `onnxruntime-node` or `protobufjs`                                                                  | They are Node-only deps of transformers.js; the browser build does not need them. The npm warning about them is expected         |
| 13  | Load fonts or scripts from a CDN (Google Fonts etc.)                                                                                                            | Privacy and offline. Use the system font stacks in section 9                                                                     |
| 14  | Use `MediaRecorder` chunks as Whisper input                                                                                                                     | Only the first WebM chunk has a header; later chunks cannot be decoded alone. Whisper input comes from the AudioWorklet PCM path |
| 15  | Create the worker anywhere except `src/features/transcribe/whisperClient.ts`                                                                                    | One worker for the whole app. React StrictMode double-mounts effects in dev                                                      |
| 16  | Use `navigator.gpu` existence alone as "WebGPU available"                                                                                                       | Headless Chromium has `navigator.gpu` but `requestAdapter()` returns `null` (verified)                                           |
| 17  | Use `TypeScript 7.x`                                                                                                                                            | `typescript-eslint@8.72.0` requires `typescript <6.1.0`                                                                          |
| 18  | Add animation libraries (motion, framer-motion, GSAP) or UI kits (Radix, shadcn, MUI) or icon packages                                                          | Not in the dependency list. CSS transitions and inline SVG icons only                                                            |
| 19  | Run `npx lighthouse` or other `npx <pkg>` that is not already a dependency                                                                                      | It downloads an unlisted package. Lighthouse checks are manual (user does them in Chrome DevTools)                               |
| 20  | Set COOP/COEP headers                                                                                                                                           | Not needed in v1; ORT falls back to single-threaded WASM. Revisit in v1.1                                                        |

---

## 1. Goals and non-goals

**Goals**

- Record, see a live transcript, and save a note in a few taps.
- Transcription runs entirely on-device (WebGPU when available, WASM fallback).
- Works offline after the first model download.
- Calm typography, a responsive waveform, short purposeful motion, and full dark mode.
- Portfolio-grade code: typed, tested, documented, and fast.

**Non-goals (v1)**

- Accounts, sync, or cloud storage.
- Speaker diarization, translation, or LLM summarization (possible v2).
- Native apps.

## 2. Environment

| Item            | Value                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Location        | `/Users/hardik/Projects/voice-notes`                                                                                                                                                      |
| Node            | 24 (`.nvmrc` = `24`). **Must be >= 24.15.0** because `jsdom@30.1.3` requires `^24.15.0`. Machine has 24.18.0 (verified)                                                                   |
| npm             | 11.16.0 (verified)                                                                                                                                                                        |
| Package manager | npm only. Commit `package-lock.json` when the user asks to commit                                                                                                                         |
| Git             | Initialized, branch **`main`** (the old plan said `master`; `git branch --show-current` prints `main`). No commits yet, no remote                                                         |
| Ports           | dev `5173`, preview/e2e `4391`. Port `4173` (Vite's default preview port) is already used by another process on this machine (verified), so preview is pinned to `4391` with `strictPort` |

---

## 3. Dependencies (pinned, verified together)

All versions below were installed together in a scratch copy on 2026-10-20 with zero peer-dependency errors. A trial build, `tsc`, ESLint, Vitest (jsdom and node envs), and Playwright (Chromium with a fake mic) all passed with this set. A real Whisper transcription ran in headless Chromium through a module worker and returned exactly `"The quick brown fox jumps over the lazy dog."`

### 3.1 Runtime dependencies

| Package                     | Version | Purpose                                                                                     |
| --------------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `react`                     | 19.3.1  | UI                                                                                          |
| `react-dom`                 | 19.3.1  | UI                                                                                          |
| `@huggingface/transformers` | 4.3.1   | Whisper in the worker (pulls `onnxruntime-web` 1.31.0-dev, pinned by transformers)          |
| `dexie`                     | 4.4.6   | IndexedDB wrapper                                                                           |
| `dexie-react-hooks`         | 4.4.0   | `useLiveQuery` for reactive lists (**added**; peer `dexie >=4.2.0-alpha.1 <5`, OK)          |
| `@tiptap/react`             | 3.32.0  | Editor React bindings                                                                       |
| `@tiptap/core`              | 3.32.0  | Peer of `@tiptap/react`; pinned explicitly so npm does not pick another version (**added**) |
| `@tiptap/pm`                | 3.32.0  | ProseMirror peer                                                                            |
| `@tiptap/starter-kit`       | 3.32.0  | Paragraph, headings, lists, bold, italic, link, underline, undo/redo                        |
| `@tiptap/extensions`        | 3.32.0  | `Placeholder` (in v3 it moved here from `@tiptap/extension-placeholder`) (**added**)        |
| `@tiptap/markdown`          | 3.32.0  | `editor.getMarkdown()` for `.md` export (**added**; avoids a hand-written serializer)       |
| `workbox-window`            | 7.4.1   | Required peer of `vite-plugin-pwa` (used by `virtual:pwa-register/react`) (**added**)       |

### 3.2 Dev dependencies

| Package                       | Version   | Purpose                                                                                                 |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| `vite`                        | 8.3.4     | Build/dev server (Rolldown-based)                                                                       |
| `@vitejs/plugin-react`        | 6.1.2     | React plugin. Peer `vite ^8.0.0`. Babel/React Compiler peers are optional; do not install them          |
| `typescript`                  | **6.0.3** | Type checking. **Not 7.0.2**, see 3.4                                                                   |
| `tailwindcss`                 | 4.3.3     | Styling                                                                                                 |
| `@tailwindcss/vite`           | 4.3.3     | Tailwind Vite plugin (peer `vite ^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8`)                                       |
| `vite-plugin-pwa`             | 2.0.0     | Service worker + manifest (peer `vite ... \|\| ^8.0.0`, OK)                                             |
| `vitest`                      | 5.0.5     | Unit tests (peer `vite ^6.4.0 \|\| ^7 \|\| ^8`)                                                         |
| `jsdom`                       | 30.1.3    | DOM env for component tests                                                                             |
| `fake-indexeddb`              | 6.2.6     | IndexedDB in Node for storage tests                                                                     |
| `@testing-library/react`      | 16.3.3    | Component tests                                                                                         |
| `@testing-library/dom`        | 10.4.2    | Required peer of `@testing-library/react` (**added**)                                                   |
| `@testing-library/jest-dom`   | 7.0.1     | DOM matchers (`toBeInTheDocument`) (**added**)                                                          |
| `@playwright/test`            | 1.64.1    | E2E                                                                                                     |
| `@axe-core/playwright`        | 4.14.0    | Automated a11y checks in e2e (**added**; peer `playwright-core >=1.0.0`, comes with `@playwright/test`) |
| `eslint`                      | 10.13.0   | Lint                                                                                                    |
| `@eslint/js`                  | 10.0.1    | ESLint recommended rules (peer `eslint ^10`)                                                            |
| `typescript-eslint`           | 8.72.0    | TS lint (peer `eslint ^8.57 \|\| ^9 \|\| ^10`, `typescript >=4.8.4 <6.1.0`)                             |
| `eslint-plugin-react-hooks`   | 7.1.1     | Hooks + React Compiler rules                                                                            |
| `eslint-plugin-react-refresh` | 0.5.7     | Fast-refresh safety (peer `eslint ^9 \|\| ^10`)                                                         |
| `eslint-config-prettier`      | 10.1.8    | Turns off rules that fight Prettier                                                                     |
| `globals`                     | 17.13.0   | Browser/worker/node globals for ESLint                                                                  |
| `prettier`                    | 3.9.10    | Formatting                                                                                              |
| `@types/react`                | 19.3.0    | Types                                                                                                   |
| `@types/react-dom`            | 19.3.0    | Types                                                                                                   |
| `@types/node`                 | 24.19.2   | Types for config files and e2e only (matches Node 24)                                                   |

### 3.3 Exact install commands (run in this order, in the project root)

```bash
npm install --save-exact react@19.3.1 react-dom@19.3.1 @huggingface/transformers@4.3.1 dexie@4.4.6 dexie-react-hooks@4.4.0 @tiptap/react@3.32.0 @tiptap/core@3.32.0 @tiptap/pm@3.32.0 @tiptap/starter-kit@3.32.0 @tiptap/extensions@3.32.0 @tiptap/markdown@3.32.0 workbox-window@7.4.1
```

```bash
npm install --save-exact --save-dev vite@8.3.4 @vitejs/plugin-react@6.1.2 typescript@6.0.3 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 vite-plugin-pwa@2.0.0 vitest@5.0.5 jsdom@30.1.3 fake-indexeddb@6.2.6 @testing-library/react@16.3.3 @testing-library/dom@10.4.2 @testing-library/jest-dom@7.0.1 @playwright/test@1.64.1 @axe-core/playwright@4.14.0 eslint@10.13.0 @eslint/js@10.0.1 typescript-eslint@8.72.0 eslint-plugin-react-hooks@7.1.1 eslint-plugin-react-refresh@0.5.7 eslint-config-prettier@10.1.8 globals@17.13.0 prettier@3.9.10 @types/react@19.3.0 @types/react-dom@19.3.0 @types/node@24.19.2
```

```bash
npx playwright install chromium
```

(Chromium build 1248 is already in `~/Library/Caches/ms-playwright`, so this is a no-op here.)

**Expected, harmless output:** `npm warn allow-scripts ... onnxruntime-node ... protobufjs ...` and a `glob@11` deprecation warning. Do not act on them (Do NOT #12). Any `ERESOLVE` error is **not** expected: stop and report it.

### 3.4 Version conflicts found and how they were resolved

| Conflict                                                                                 | Evidence                                                                              | Resolution                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript@7.0.2` vs `typescript-eslint@8.72.0`                                         | `npm view typescript-eslint@8.72.0 peerDependencies` → `typescript: ">=4.8.4 <6.1.0"` | Pin **`typescript@6.0.3`** (latest 6.0.x). TS 6 compiled the trial scaffold cleanly with the tsconfig in 6.3                                       |
| `jsdom@30.1.3` engine `node ^24.15.0`                                                    | `npm view jsdom@30.1.3 engines`                                                       | Add `"engines": { "node": ">=24.15.0" }` to `package.json`. `.nvmrc` stays `24`                                                                    |
| `vitest@5.0.5` engine `^22.12.0 \|\| ^24 \|\| >=26`                                      | `npm view`                                                                            | OK on Node 24                                                                                                                                      |
| `vite-plugin-pwa@2.0.0` needs `workbox-window` and `workbox-build` as non-optional peers | `npm view ... peerDependenciesMeta`                                                   | npm installs `workbox-build` automatically; `workbox-window` is pinned explicitly because app code imports it through `virtual:pwa-register/react` |
| `@testing-library/react` needs `@testing-library/dom` peer                               | `npm view`                                                                            | Pinned `@testing-library/dom@10.4.2`                                                                                                               |
| `@tiptap/react` peers `@tiptap/core` + `@tiptap/pm` at exactly `3.32.0`                  | `npm view`                                                                            | All `@tiptap/*` pinned to `3.32.0`. **Never mix Tiptap versions**                                                                                  |
| Vite 8 warns `ESM syntax in a file loaded as CommonJS (vite.config.ts)`                  | Seen in trial build                                                                   | `package.json` must have `"type": "module"`                                                                                                        |

No other conflicts found.

---

## 4. Changes from the previous plan (and why)

| Change                                                                                                                                          | Reason                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git branch is `main`, not `master`                                                                                                              | `git branch --show-current` prints `main`                                                                                                                                                    |
| TypeScript 6.0.3, not latest 7.x                                                                                                                | typescript-eslint peer range (3.4)                                                                                                                                                           |
| **Whisper input comes from an AudioWorklet PCM stream, not from MediaRecorder chunks.** MediaRecorder is kept for the stored/playback file only | WebM timeslice chunks after the first have no header, so they cannot be decoded on their own. The old data flow ("MediaRecorder chunks every ~3s → worker") would fail after the first chunk |
| Live transcript uses a sliding window with commit rules (section 7.4), plus a final full pass on stop                                           | Defines "firms up" precisely and makes the merge logic unit-testable                                                                                                                         |
| Segment-level timestamps (`return_timestamps: true`) in v1, not word-level                                                                      | Verified to work with `onnx-community/whisper-base`. Word timestamps (`'word'`) need cross-attention outputs. Not verified for this export; deferred to v1.1 with the click-a-word feature   |
| Model download is user-initiated the first time ("Download model, about 80 MB")                                                                 | 80 to 200 MB is a lot on mobile data. Later visits load from cache automatically                                                                                                             |
| Recording is enabled only when the model is ready                                                                                               | Avoids a "transcribe later from stored audio" path in v1                                                                                                                                     |
| No router package; a tiny hash router (`#/`, `#/note/<id>`)                                                                                     | Two screens do not justify a dependency; works with the SW navigation fallback                                                                                                               |
| System font stacks only, no web fonts                                                                                                           | Offline and privacy; no downloads                                                                                                                                                            |
| Tokens in hex (sRGB) with an automated contrast check script                                                                                    | The script can verify WCAG contrast. oklch would need a color-math dependency                                                                                                                |
| Lighthouse "PWA" check replaced                                                                                                                 | Lighthouse removed the PWA category in v12 (current is 13.5.0). Replaced with an installability e2e test plus a manual DevTools check                                                        |
| `motion` skill: CSS only; `21st:21st-ui`: reference only, never run its install commands                                                        | Both tend to pull unlisted packages (motion, Radix, lucide, clsx)                                                                                                                            |
| Editor screen is lazy-loaded (`React.lazy`)                                                                                                     | Keeps Tiptap out of the main chunk (bundle budget, section 11)                                                                                                                               |

Everything else (stack, features, milestones, design direction) is unchanged.

---

## 5. Architecture

### 5.1 Data flow

```
          user gesture (click / Space)
                    │
      getUserMedia({audio}) ── MediaStream ─┬──► MediaRecorder(timeslice 1000ms) ──► Blob parts ──► Dexie audioChunks (crash safety)
                    │                       │                                                  └─ on stop: concat → Dexie audio
                    │                       └──► AudioContext ─► MediaStreamSource ─┬─► AnalyserNode ─► <canvas> waveform (rAF)
                    │                                                               └─► AudioWorkletNode 'pcm-capture'
                    │                                                                     │ Float32 frames @ ctx.sampleRate (often 48000)
                    │                                                                     ▼
                    │                                                     streaming resampler → 16 kHz PcmBuffer (main thread)
                    │                                                                     │ every 2 s if worker idle: slice window
                    ▼                                                                     ▼
          whisperClient.ts (singleton) ── postMessage(transfer) ──► whisper.worker.ts (pipeline 'automatic-speech-recognition')
                    ▲                                                                     │
                    └──────────── {type:'result', chunks:[{text,start,end}]} ◄────────────┘
                    │
          merge.ts: committed + tentative text  ──► Live transcript UI
                    │
          on stop: final full pass over the whole 16 kHz buffer → note saved to Dexie (Tiptap JSON + plain text + segments)
```

### 5.2 Final source tree (after M8)

```
voice-notes/
  .gitignore
  .nvmrc
  .prettierignore
  .prettierrc.json
  DESIGN.md                      (M0, written by impeccable)
  PRODUCT.md                     (M0, written by impeccable init)
  PLAN.md
  README.md                      (M8)
  design-system/voice-notes/MASTER.md   (M0, written by ui-ux-pro-max --persist)
  eslint.config.js
  index.html
  package.json
  package-lock.json
  playwright.config.ts
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  vitest.config.ts
  public/
    favicon.svg
    icons/ (generated by scripts/make-icons.mjs)
  scripts/
    check-bundle.mjs
    check-contrast.mjs
    make-fixture.mjs
    make-icons.mjs
  src/
    main.tsx
    App.tsx
    index.css
    vite-env.d.ts
    app/
      Layout.tsx
      router.ts
      theme.ts
      UpdatePrompt.tsx
      ThemeToggle.tsx
    design/
      tokens.css
      components/
        Button.tsx
        IconButton.tsx
        Icon.tsx
        Toast.tsx
        ProgressBar.tsx
    features/
      recorder/
        pcm-capture.worklet.ts
        pcmBuffer.ts
        resample.ts
        mime.ts
        recorder.ts
        useRecorder.ts
        useSpaceToggle.ts
        RecordButton.tsx
        Waveform.tsx
        RecorderPanel.tsx
      transcribe/
        config.ts
        protocol.ts
        whisperClient.ts
        merge.ts
        useTranscriber.ts
        ModelStatus.tsx
        LiveTranscript.tsx
      notes/
        NotesList.tsx
        NotePage.tsx
        NoteEditor.tsx
        exportNote.ts
        title.ts
        transcriptToDoc.ts
    workers/
      whisper.worker.ts
    storage/
      db.ts
      notes.ts
      audio.ts
    lib/
      format.ts
      debounce.ts
  tests/
    setup.ts
    fixtures/ (generated, git-ignored)
    unit/
      format.test.ts
      resample.test.ts
      pcmBuffer.test.ts
      mime.test.ts
      merge.test.ts
      title.test.ts
      transcriptToDoc.test.ts
      exportNote.test.ts
      storage.test.ts
      RecordButton.test.tsx
    e2e/
      smoke.spec.ts
      recorder.spec.ts
      transcribe.spec.ts
      notes.spec.ts
      offline.spec.ts
      a11y.spec.ts
      screenshots.spec.ts        (M8 utility, runs only with SCREENSHOTS=1)
  docs/
    screenshots/                 (M8, PNGs referenced by README)
```

---

## 6. M0 files: exact contents and specs

### 6.1 `package.json` (spec; build it with npm commands in M0 step 2)

Fields: `"name": "voice-notes"`, `"version": "0.1.0"`, `"private": true`, `"type": "module"`, `"engines": { "node": ">=24.15.0" }`, and these scripts exactly:

```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "typecheck": "tsc -p tsconfig.json && tsc -p tsconfig.node.json",
  "lint": "eslint .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "node scripts/make-fixture.mjs && playwright test",
  "icons": "node scripts/make-icons.mjs",
  "check:bundle": "node scripts/check-bundle.mjs",
  "check:contrast": "node scripts/check-contrast.mjs",
  "verify": "npm run typecheck && npm run lint && npm run format:check && npm run test && npm run build && npm run check:bundle && npm run check:contrast"
}
```

Remove the `"main"`, `"keywords"`, `"author"`, `"license"` and `"description"` fields `npm init` adds, except set `"license": "MIT"`.

### 6.2 `vite.config.ts` (verbatim, verified)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      devOptions: { enabled: false },
      manifest: {
        name: 'Voice Notes',
        short_name: 'Voice Notes',
        description: 'Private voice notes. Transcribed on your device.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#faf7f2',
        theme_color: '#faf7f2',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4391, strictPort: true },
});
```

After M0 step 9 (design), replace the two `#faf7f2` values with the final light `--vn-bg` value from `tokens.css`. Change nothing else.

### 6.3 TypeScript configs (verbatim, verified with TS 6.0.3)

`tsconfig.json` (app code and unit tests):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests/unit", "tests/setup.ts"]
}
```

`tsconfig.node.json` (config files and e2e):

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts", "tests/e2e"]
}
```

`src/vite-env.d.ts` (verbatim):

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
```

### 6.4 `eslint.config.js` (verbatim, verified)

```js
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  globalIgnores(['dist', 'dev-dist', 'coverage', 'playwright-report', 'test-results']),
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      prettier,
    ],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.worker } },
  },
  {
    files: ['*.config.ts', 'scripts/**/*.mjs', 'eslint.config.js'],
    extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
    languageOptions: { ecmaVersion: 2023, globals: globals.node },
  },
]);
```

### 6.5 Prettier and git ignore files (verbatim)

`.prettierrc.json`:

```json
{
  "singleQuote": true,
  "printWidth": 100
}
```

`.prettierignore`:

```
dist
dev-dist
coverage
playwright-report
test-results
package-lock.json
tests/fixtures
public/icons
design-system
```

`.gitignore`:

```
node_modules
dist
dev-dist
coverage
playwright-report
test-results
tests/fixtures/*.wav
.DS_Store
*.log
```

### 6.6 `vitest.config.ts` (verbatim, verified)

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/unit/**/*.test.{ts,tsx}'],
    },
  }),
);
```

`tests/setup.ts` (verbatim):

```ts
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
```

### 6.7 `playwright.config.ts` (verbatim, verified with a fake mic)

```ts
import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const speechWav = fileURLToPath(new URL('./tests/fixtures/speech.wav', import.meta.url));

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://localhost:4391', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4391',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-audio-capture=${speechWav}`,
          ],
        },
      },
    },
  ],
});
```

`workers: 1` because the model cache and IndexedDB are per browser profile and the tests share the preview server.

### 6.8 `index.html` (spec)

- `<!doctype html>`, `<html lang="en">`.
- `<meta charset="UTF-8">`, `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` (do **not** add `maximum-scale` or `user-scalable=no`).
- `<meta name="description" content="Private voice notes. Transcribed on your device.">`
- `<meta name="theme-color" content="<light --vn-bg>">`
- `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`, `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">`
- `<title>Voice Notes</title>`
- An inline `<script>` in `<head>`, **before** any CSS, that reads `localStorage.getItem('vn-theme')` inside `try/catch` and, if the value is `'light'` or `'dark'`, sets `document.documentElement.dataset.theme` to it. This prevents a theme flash.
- `<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>`

### 6.9 `src/index.css` (verbatim; token values live in `tokens.css`)

```css
@import 'tailwindcss';
@import './design/tokens.css';

@custom-variant dark (&:where([data-theme='dark'], [data-theme='dark'] *));

@theme inline {
  --color-bg: var(--vn-bg);
  --color-surface: var(--vn-surface);
  --color-fg: var(--vn-fg);
  --color-fg-muted: var(--vn-fg-muted);
  --color-border: var(--vn-border);
  --color-accent: var(--vn-accent);
  --color-accent-fg: var(--vn-accent-fg);
  --color-danger: var(--vn-danger);
  --color-focus: var(--vn-focus);
  --font-sans: var(--vn-font-sans);
  --font-serif: var(--vn-font-serif);
  --radius-sm: var(--vn-radius-sm);
  --radius-md: var(--vn-radius-md);
  --radius-lg: var(--vn-radius-lg);
}

html {
  background: var(--vn-bg);
  color: var(--vn-fg);
  font-family: var(--vn-font-sans);
}

:focus-visible {
  outline: 2px solid var(--vn-focus);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Verified: `@theme inline` emits `.bg-bg{background-color:var(--vn-bg)}`. Tailwind v4 has **no** `--duration-*` theme namespace (verified: it emits nothing). For durations write `duration-(--vn-dur-fast)` (verified to emit `transition-duration:var(--vn-dur-fast)`).

### 6.10 Scripts (verbatim, all verified to run)

`scripts/make-icons.mjs`: writes PNG icons with no dependencies.

```js
// Writes public/icons/{icon-192,icon-512,maskable-512,apple-touch-icon}.png. No dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x1f, 0x1b, 0x18]; // set to the dark --vn-bg from tokens.css
const FG = [0xe0, 0x6c, 0x4f]; // set to the dark --vn-accent from tokens.css

function crc32(buf) {
  let c;
  let crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, radiusRatio) {
  const rows = [];
  const r = size * radiusRatio;
  const c = size / 2;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3);
    for (let x = 0; x < size; x++) {
      const inside = (x + 0.5 - c) ** 2 + (y + 0.5 - c) ** 2 <= r * r;
      const [R, G, B] = inside ? FG : BG;
      row[1 + x * 3] = R;
      row[2 + x * 3] = G;
      row[3 + x * 3] = B;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, 0.3));
writeFileSync('public/icons/icon-512.png', png(512, 0.3));
writeFileSync('public/icons/maskable-512.png', png(512, 0.22)); // inside the maskable safe zone
writeFileSync('public/icons/apple-touch-icon.png', png(180, 0.3));
console.log('icons written');
```

`scripts/make-fixture.mjs`: generates test audio locally (no downloads).

```js
// Writes tests/fixtures/tone.wav (pure JS) and, on macOS, tests/fixtures/speech.wav (built-in `say`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';

const FIXTURE_SENTENCE = 'The quick brown fox jumps over the lazy dog.';
mkdirSync('tests/fixtures', { recursive: true });

function writeWav(path, samples, sampleRate) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) =>
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 0x7fff), i * 2),
  );
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

const rate = 48000;
const tone = Array.from(
  { length: rate * 3 },
  (_, i) => 0.3 * Math.sin((2 * Math.PI * 440 * i) / rate),
);
writeWav('tests/fixtures/tone.wav', tone, rate);

if (platform() === 'darwin') {
  execFileSync('say', [
    '-o',
    'tests/fixtures/speech.wav',
    '--file-format=WAVE',
    '--data-format=LEI16@48000',
    FIXTURE_SENTENCE,
  ]);
  console.log('wrote tests/fixtures/speech.wav and tone.wav');
} else {
  console.warn('Not macOS: only tone.wav written. Transcription e2e tests will skip.');
}
```

Verified output: `speech.wav` is 16-bit PCM mono 48 kHz, about 2.5 s. Whisper (`whisper-base`, WASM q8) transcribed it exactly. Chromium's fake mic plays it in a loop.

`scripts/check-bundle.mjs`: bundle budget and "transformers only in the worker".

```js
// Exit 1 if the main entry chunk is over budget or transformers.js leaked out of the worker chunk.
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const BUDGET_GZIP_KB = 150;
const html = readFileSync('dist/index.html', 'utf8');
const entry = html.match(
  /<script type="module" crossorigin src="\/(assets\/index-[^"]+\.js)"/,
)?.[1];
if (!entry) {
  console.error('Entry chunk not found in dist/index.html');
  process.exit(1);
}
const kb = gzipSync(readFileSync(`dist/${entry}`)).length / 1024;
console.log(`main entry ${entry}: ${kb.toFixed(1)} kB gzip (budget ${BUDGET_GZIP_KB} kB)`);
let failed = kb > BUDGET_GZIP_KB;
for (const f of readdirSync('dist/assets').filter(
  (n) => n.endsWith('.js') && !n.startsWith('whisper.worker-'),
)) {
  const src = readFileSync(`dist/assets/${f}`, 'utf8');
  if (src.includes('onnxruntime') || src.includes('automatic-speech-recognition')) {
    console.error(`transformers.js code found outside the worker: ${f}`);
    failed = true;
  }
}
const sw = readFileSync('dist/sw.js', 'utf8');
if (/\.(onnx|wasm)["']/.test(sw)) {
  console.error('Service worker precaches .onnx or .wasm files');
  failed = true;
}
process.exit(failed ? 1 : 0);
```

`scripts/check-contrast.mjs`: WCAG contrast for the token pairs. Spec: copy the version below exactly.

```js
// Checks WCAG 2.x contrast of required token pairs in src/design/tokens.css (light and dark).
import { readFileSync } from 'node:fs';

const css = readFileSync('src/design/tokens.css', 'utf8').replaceAll('"', "'");
function block(selector) {
  const start = css.indexOf(selector);
  if (start === -1) throw new Error(`Missing block: ${selector}`);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--vn-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m) => [m[1], m[2]]),
  );
}
function lum(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const PAIRS = [
  ['--vn-fg', '--vn-bg', 4.5],
  ['--vn-fg', '--vn-surface', 4.5],
  ['--vn-fg-muted', '--vn-bg', 4.5],
  ['--vn-fg-muted', '--vn-surface', 4.5],
  ['--vn-accent-fg', '--vn-accent', 4.5],
  ['--vn-accent', '--vn-bg', 3],
  ['--vn-danger', '--vn-bg', 4.5],
  ['--vn-focus', '--vn-bg', 3],
  ['--vn-border', '--vn-bg', 1.3],
];
let failed = false;
const darkMedia = block(":root:not([data-theme='light'])");
const darkAttr = block(":root[data-theme='dark']");
if (JSON.stringify(darkMedia) !== JSON.stringify(darkAttr)) {
  console.error(
    'FAIL dark values differ between the prefers-color-scheme block and the [data-theme=dark] block',
  );
  failed = true;
}
const light = block(':root {');
for (const [name, tokens] of [
  ['light', light],
  ['dark', { ...light, ...darkAttr }],
]) {
  for (const [fg, bg, min] of PAIRS) {
    if (!tokens[fg] || !tokens[bg]) {
      console.error(`FAIL ${name}: missing ${!tokens[fg] ? fg : bg} (must be a 6-digit hex)`);
      failed = true;
      continue;
    }
    const r = ratio(tokens[fg], tokens[bg]);
    if (r < min) failed = true;
    console.log(
      `${r >= min ? 'PASS' : 'FAIL'} ${name} ${fg} on ${bg}: ${r.toFixed(2)} (min ${min})`,
    );
  }
}
process.exit(failed ? 1 : 0);
```

### 6.11 M0 file tree (exactly these files exist at the end of M0)

| File                                                                                   | Purpose                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.nvmrc`                                                                               | Node 24 (exists)                                                                                                                                                                                                                                         |
| `.gitignore`                                                                           | 6.5                                                                                                                                                                                                                                                      |
| `.prettierrc.json`, `.prettierignore`                                                  | 6.5                                                                                                                                                                                                                                                      |
| `PLAN.md`                                                                              | This plan (exists)                                                                                                                                                                                                                                       |
| `PRODUCT.md`                                                                           | Product context from `impeccable init` (step 9)                                                                                                                                                                                                          |
| `DESIGN.md`                                                                            | Design direction and token rationale from `impeccable` (step 9)                                                                                                                                                                                          |
| `design-system/voice-notes/MASTER.md`                                                  | ui-ux-pro-max design-system output (step 9)                                                                                                                                                                                                              |
| `package.json`, `package-lock.json`                                                    | 6.1                                                                                                                                                                                                                                                      |
| `index.html`                                                                           | 6.8                                                                                                                                                                                                                                                      |
| `vite.config.ts`                                                                       | 6.2                                                                                                                                                                                                                                                      |
| `vitest.config.ts`                                                                     | 6.6                                                                                                                                                                                                                                                      |
| `playwright.config.ts`                                                                 | 6.7                                                                                                                                                                                                                                                      |
| `tsconfig.json`, `tsconfig.node.json`                                                  | 6.3                                                                                                                                                                                                                                                      |
| `eslint.config.js`                                                                     | 6.4                                                                                                                                                                                                                                                      |
| `public/favicon.svg`                                                                   | 32×32 viewBox SVG: a filled circle in the accent color on the dark bg (hand-written)                                                                                                                                                                     |
| `public/icons/*.png`                                                                   | Output of `npm run icons`                                                                                                                                                                                                                                |
| `scripts/make-icons.mjs`, `make-fixture.mjs`, `check-bundle.mjs`, `check-contrast.mjs` | 6.10                                                                                                                                                                                                                                                     |
| `src/main.tsx`                                                                         | `createRoot(#root).render(<StrictMode><App/></StrictMode>)`, imports `./index.css`. Throw if `#root` is missing                                                                                                                                          |
| `src/App.tsx`                                                                          | M0: renders `<Layout>` with an `<h1>Voice Notes</h1>` and a paragraph "Scaffold ready." plus `<UpdatePrompt/>`                                                                                                                                           |
| `src/index.css`                                                                        | 6.9                                                                                                                                                                                                                                                      |
| `src/vite-env.d.ts`                                                                    | 6.3                                                                                                                                                                                                                                                      |
| `src/design/tokens.css`                                                                | Design tokens (step 9, contract in section 9)                                                                                                                                                                                                            |
| `src/app/Layout.tsx`                                                                   | `<header>` (app name + `ThemeToggle`), `<main id="main">`, a "Skip to content" link as the first focusable element                                                                                                                                       |
| `src/app/theme.ts`                                                                     | `getTheme(): 'light' \| 'dark' \| 'system'`, `setTheme(t)`: writes `localStorage['vn-theme']` in try/catch, sets or removes `document.documentElement.dataset.theme`                                                                                     |
| `src/app/ThemeToggle.tsx`                                                              | Button cycling system → light → dark. `aria-label="Theme: <current>. Change theme"`                                                                                                                                                                      |
| `src/app/UpdatePrompt.tsx`                                                             | Uses `useRegisterSW` from `virtual:pwa-register/react`. When `needRefresh[0]` is true show a toast "A new version is ready" with a "Reload" button calling `updateServiceWorker(true)`. When `offlineReady[0]` is true show "Ready to work offline" once |
| `src/lib/format.ts`                                                                    | `formatDuration(ms)` → `m:ss` (or `h:mm:ss` when ≥ 1 h), `formatBytes(n)` → `"12.3 MB"` (base 1000, one decimal; units B, kB, MB, GB), `formatDate(ts, locale?)` via `Intl.DateTimeFormat`                                                               |
| `tests/setup.ts`                                                                       | 6.6                                                                                                                                                                                                                                                      |
| `tests/unit/format.test.ts`                                                            | Tests for `format.ts` (section 10)                                                                                                                                                                                                                       |
| `tests/e2e/smoke.spec.ts`                                                              | Opens `/`, expects heading "Voice Notes", expects `MediaRecorder.isTypeSupported('audio/webm;codecs=opus')` to be true (sanity check of the browser)                                                                                                     |

---

## 7. Core contracts (used by M1 to M5)

### 7.1 `src/features/transcribe/config.ts` (verbatim)

```ts
export const MODEL_ID = 'onnx-community/whisper-base';
export const ASR_TASK = 'automatic-speech-recognition';
export const SAMPLE_RATE = 16_000;
/** WebGPU: fp32 encoder + 4-bit decoder (~78 MB + ~117 MB). From the upstream WebGPU Whisper example; verify in M2. */
export const DTYPE_WEBGPU = { encoder_model: 'fp32', decoder_model_merged: 'q4' } as const;
/** WASM: 8-bit both (~22 MB + ~51 MB). Verified: files encoder_model_quantized.onnx + decoder_model_merged_quantized.onnx. */
export const DTYPE_WASM = { encoder_model: 'q8', decoder_model_merged: 'q8' } as const;
export const LANGUAGE = 'english';
export const LIVE_TICK_MS = 2_000;
export const WINDOW_COMMIT_SEC = 20;
export const COMMIT_GUARD_SEC = 3;
export const WINDOW_MAX_SEC = 28;
export const MAX_RECORDING_SEC = 20 * 60;
export const FINAL_CHUNK_LENGTH_S = 30;
export const FINAL_STRIDE_LENGTH_S = 5;
```

Model facts (checked on huggingface.co on 2026-10-20 via the tree API):

| Repo                                        | WASM download (q8 enc + q8 dec + ~7 MB tokenizer/config) | WebGPU download (fp32 enc + q4 dec + ~7 MB) | Notes                                |
| ------------------------------------------- | -------------------------------------------------------- | ------------------------------------------- | ------------------------------------ |
| `onnx-community/whisper-base` (**default**) | ≈ 80 MB                                                  | ≈ 202 MB                                    | Multilingual. Verified transcription |
| `onnx-community/whisper-base.en`            | ≈ 80 MB                                                  | ≈ 202 MB                                    | English only                         |
| `onnx-community/whisper-tiny.en`            | ≈ 45 MB                                                  | ≈ 120 MB                                    | Fallback if base is too slow         |
| `onnx-community/whisper-tiny`               | ≈ 45 MB                                                  | ≈ 120 MB                                    | Multilingual tiny                    |
| `onnx-community/whisper-small`              | ≈ 244 MB                                                 | ≈ 565 MB                                    | Too big for v1                       |

Note: for Whisper, `q4` decoder files are **larger** than `q8` (base: 117 MB vs 51 MB). `q8` maps to the `_quantized` file suffix.

### 7.2 Worker protocol: `src/features/transcribe/protocol.ts` (spec)

Export these TypeScript types (discriminated unions on `type`):

Main → worker (`ToWorker`):

- `{ type: 'probe' }`: worker picks the device and replies `probe-result`.
- `{ type: 'load' }`: load the pipeline (downloads if not cached).
- `{ type: 'transcribe'; id: number; kind: 'live' | 'final'; audio: Float32Array }`: 16 kHz mono. Send with `postMessage(msg, [msg.audio.buffer])`. Send a **copy** (`slice()`), never a view of the live buffer.

Worker → main (`FromWorker`):

- `{ type: 'probe-result'; device: 'webgpu' | 'wasm'; cached: boolean; approxDownloadMB: number }`
- `{ type: 'progress'; loaded: number; total: number; progress: number }` (from the `progress_total` event; `progress` is 0 to 100)
- `{ type: 'ready'; device: 'webgpu' | 'wasm'; modelId: string }`
- `{ type: 'result'; id: number; kind: 'live' | 'final'; text: string; chunks: Segment[]; ms: number }`
- `{ type: 'error'; id?: number; stage: 'probe' | 'load' | 'transcribe'; message: string }`

`Segment = { text: string; start: number; end: number | null }` (seconds, relative to the audio that was sent).

### 7.3 `src/workers/whisper.worker.ts` (spec)

1. `import { pipeline, env, ModelRegistry, type ProgressInfo } from '@huggingface/transformers';` This file is the **only** importer of transformers.
2. Set `env.allowLocalModels = false` (no `/models/` lookups on our origin; in v4 it already defaults to `false` in browsers, set it anyway to be explicit). Leave `env.useBrowserCache` (default `true`) and `env.useWasmCache` (default `true`) alone. Do **not** set `env.backends.onnx.wasm.wasmPaths`: by default ORT's `.wasm`/`.mjs` load from `cdn.jsdelivr.net/npm/onnxruntime-web@<ver>/dist/` and are stored in the `transformers-cache` Cache API store, which makes offline work.
3. `pickDevice()`: `if ('gpu' in navigator)`, `const adapter = await navigator.gpu.requestAdapter()`; return `'webgpu'` only if `adapter !== null`, else `'wasm'`. Wrap in try/catch → `'wasm'`. (WebGPU types: declare a minimal local interface; do not add `@webgpu/types`.)
4. `probe`: device = `pickDevice()`; `cached = await ModelRegistry.is_pipeline_cached(ASR_TASK, MODEL_ID, { device, dtype })` in try/catch (false on error); reply `probe-result` with `approxDownloadMB` 202 (webgpu) or 80 (wasm).
5. `load`: keep one module-level `Promise` for the pipeline so repeated `load` messages reuse it. Call `pipeline(ASR_TASK, MODEL_ID, { device, dtype, progress_callback })`. In `progress_callback`, forward only `status === 'progress_total'` events, throttled to at most one message per 100 ms (always send the last one). If loading with `'webgpu'` throws, log it, set device to `'wasm'`, and retry once with `DTYPE_WASM`. Reply `ready`.
6. Warm-up: right after load, run the pipeline once on `new Float32Array(SAMPLE_RATE)` (1 s of silence) so the first real call is not slow. Ignore its output.
7. `transcribe`: one at a time. Use an internal queue of length 1: if a `live` request arrives while busy, replace any queued `live` request (drop the older one). A `final` request is never dropped and runs after the current one. Call:
   ```ts
   await asr(audio, {
     language: LANGUAGE,
     task: 'transcribe',
     return_timestamps: true,
     ...(kind === 'final'
       ? { chunk_length_s: FINAL_CHUNK_LENGTH_S, stride_length_s: FINAL_STRIDE_LENGTH_S }
       : {}),
   });
   ```
   The output is `{ text, chunks?: { text, timestamp: [number, number | null] }[] }`. Map chunks to `Segment`. Reply `result` with elapsed `ms`.
8. Every handler is wrapped in try/catch and replies `error` with the stage.

### 7.4 Live transcript merge: `src/features/transcribe/merge.ts` (spec, pure functions)

```ts
export interface LiveState {
  committed: Segment[]; // absolute seconds from recording start
  committedUntilSec: number; // next window starts here
  tentative: string; // shown dimmed
}
export function initialLiveState(): LiveState;
export function applyLiveResult(
  state: LiveState,
  result: { chunks: Segment[]; windowStartSec: number; windowEndSec: number },
): LiveState;
export function joinSegments(segments: Segment[]): string; // trim each, join with ' ', collapse whitespace
export function displayText(state: LiveState): { committed: string; tentative: string };
```

Rules for `applyLiveResult` (never mutate the input):

1. `len = windowEndSec - windowStartSec`.
2. If `len < WINDOW_COMMIT_SEC`: return state with `tentative = joinSegments(chunks)`; nothing committed.
3. Otherwise `boundary = len - COMMIT_GUARD_SEC`. Commit, in order, every chunk with `end !== null && end <= boundary`. Stop at the first chunk that fails (keep order).
4. If nothing was committed and `len >= WINDOW_MAX_SEC`: commit all chunks with `end !== null`; if still none, commit one segment `{ text: joinSegments(chunks), start: 0, end: len }`.
5. Committed segments are shifted to absolute time: `start + windowStartSec`, `end + windowStartSec`.
6. `committedUntilSec = windowStartSec + (end of the last committed chunk)`; unchanged if nothing committed.
7. `tentative = joinSegments(chunks not committed)`.
8. Drop committed segments whose trimmed text is empty or is one of the known Whisper silence outputs: `[BLANK_AUDIO]`, `(silence)`, `[ Silence ]`, `[MUSIC]`. (Check case-insensitively after trimming.)

The live loop (`useTranscriber`): every `LIVE_TICK_MS`, if the worker has no live request in flight, send `pcm.slice(committedUntilSec * 16000, now)` as `live` with `windowStartSec = committedUntilSec`. Remember `windowStartSec`/`windowEndSec` per request `id`.

On stop: send the whole buffer as `final`. When the result arrives, the note's transcript is `joinSegments(final.chunks)` and its segments are `final.chunks`. The live state is discarded.

### 7.5 Storage: `src/storage/db.ts` (spec)

```ts
import { Dexie, type EntityTable } from 'dexie';

export interface Note {
  id: string; // crypto.randomUUID()
  title: string;
  contentJson: string; // JSON.stringify(editor.getJSON())
  plainText: string; // editor.getText(), for search and the list preview
  segments: Segment[]; // from the final pass, absolute seconds
  audioId: string | null;
  durationMs: number;
  language: string; // 'english' in v1
  modelId: string; // MODEL_ID at transcription time
  device: 'webgpu' | 'wasm';
  createdAt: number; // Date.now()
  updatedAt: number;
}
export interface AudioRecord {
  id: string;
  noteId: string;
  blob: Blob;
  mimeType: string;
  sizeBytes: number;
  createdAt: number;
}
export interface AudioChunk {
  seq?: number;
  sessionId: string;
  index: number;
  blob: Blob;
  mimeType: string;
  createdAt: number;
}

export class VoiceNotesDB extends Dexie {
  notes!: EntityTable<Note, 'id'>;
  audio!: EntityTable<AudioRecord, 'id'>;
  audioChunks!: EntityTable<AudioChunk, 'seq'>;
  constructor(name = 'voice-notes') {
    super(name);
    this.version(1).stores({
      notes: 'id, createdAt, updatedAt',
      audio: 'id, noteId',
      audioChunks: '++seq, sessionId, [sessionId+index]',
    });
  }
}
export const db = new VoiceNotesDB();
```

(Verified: `import { Dexie, type EntityTable } from 'dexie'` works with Dexie 4.4.6, and a Blob round-trips through fake-indexeddb in the Vitest `node` environment.)

Rules: never index `blob`, `contentJson`, `plainText` or `segments`. Never change the `version(1)` string after the first commit that ships it; add `version(2)` with `.upgrade()` instead (pitfall 13.9).

`src/storage/notes.ts` exports: `createNote(input) → Note`, `getNote(id)`, `updateNoteContent(id, { contentJson, plainText, title })` (sets `updatedAt`), `deleteNote(id) → { note, audio }` (one `rw` transaction over `notes` + `audio`; returns the removed records for undo), `restoreNote({ note, audio })` (one transaction, `put` both), `listNotes()` (by `updatedAt` desc).

`src/storage/audio.ts` exports: `appendChunk(sessionId, index, blob, mimeType)`, `finalizeSession(sessionId, noteId) → AudioRecord` (reads chunks ordered by `[sessionId+index]`, `new Blob(blobs, { type: mimeType })`, writes `audio`, deletes the chunks, all in one transaction), `listOrphanSessions() → string[]`, `discardSession(sessionId)`, `getAudio(id)`, `estimateUsage()` (wraps `navigator.storage.estimate()`, returns `null` if unavailable).

---

## 8. Milestones

Each milestone: Goal → Steps → Acceptance (commands) → Done when → On-track checklist.

### M0: Scaffold, tooling, design tokens

**Goal:** an empty, styled, installable app shell with all tooling green.

**Steps**

1. Confirm the environment: run `node -v` (must print `v24.15.0` or higher) and `git branch --show-current` (prints `main`). If Node is lower, stop and ask.
2. `npm init -y`, then run:
   `npm pkg set name=voice-notes version=0.1.0 private=true type=module license=MIT engines.node=">=24.15.0"`
   then `npm pkg delete main keywords author description`, then set each script from 6.1 with `npm pkg set scripts.<name>="<command>"` (one command per script; check `package.json` afterwards; the scripts block must match 6.1 exactly).
3. Run the two install commands from 3.3, then `npx playwright install chromium`. Check `package.json` lists every package at the exact version from 3.1/3.2 with no `^`.
4. Create `.gitignore`, `.prettierrc.json`, `.prettierignore` (6.5).
5. Create `tsconfig.json`, `tsconfig.node.json`, `src/vite-env.d.ts` (6.3), `eslint.config.js` (6.4).
6. Create `vite.config.ts` (6.2), `vitest.config.ts` and `tests/setup.ts` (6.6), `playwright.config.ts` (6.7).
7. Create the four scripts in `scripts/` (6.10).
8. Create `index.html` (6.8), `src/main.tsx`, `src/App.tsx`, `src/index.css` (6.9), `src/app/Layout.tsx`, `src/app/theme.ts`, `src/app/ThemeToggle.tsx`, `src/app/UpdatePrompt.tsx`, `src/lib/format.ts` (specs in 6.11). Create a **temporary** `src/design/tokens.css` with the token names from section 9 and placeholder values that pass `check:contrast`.
9. **Design system (section 9).** Run the skills and replace `src/design/tokens.css` with the final tokens. Write `PRODUCT.md`, `DESIGN.md`, `design-system/voice-notes/MASTER.md`.
10. Update `BG`/`FG` in `scripts/make-icons.mjs` to the final dark `--vn-bg`/`--vn-accent`, run `npm run icons`, and write `public/favicon.svg` with the same colors. Update `#faf7f2` in `vite.config.ts` and `theme-color` in `index.html` to the final light `--vn-bg`.
11. Write `tests/unit/format.test.ts` and `tests/e2e/smoke.spec.ts`.
12. Run `npm run format` once, then the acceptance commands.

**Acceptance**

```bash
npm run verify
npm run test:e2e
npm run dev   # open http://localhost:5173, check the page renders, then stop it (Ctrl+C)
```

**Done when**

- `npm run verify` exits 0 (typecheck, lint, format check, unit tests, build, bundle check, contrast check).
- `npm run test:e2e` passes `smoke.spec.ts`.
- `dist/sw.js` and `dist/manifest.webmanifest` exist after the build; the manifest lists 3 icons.
- `src/design/tokens.css` defines every token in section 9 for light and dark; `npm run check:contrast` prints only `PASS`.
- `PRODUCT.md`, `DESIGN.md`, `design-system/voice-notes/MASTER.md` exist.
- `git status` shows no files outside the M0 table in 6.11 (plus `node_modules` ignored).

**On-track checklist (M0)**

- [ ] `grep -c '"\^' package.json` prints `0` (no caret ranges).
- [ ] `grep '"typescript"' package.json` shows `6.0.3`.
- [ ] `grep -r "tailwind.config" .` (excluding node_modules) finds nothing. There is no Tailwind config file in v4.
- [ ] Toggling the theme button changes colors, and reloading keeps the choice without a flash.
- [ ] Tab from the address bar: the first focus is "Skip to content", with a visible focus ring.
- [ ] Report to the user; ask whether to commit.

### M1: Recorder and waveform

**Goal:** record a clip with a big button or Space, see the waveform react, play it back.

**Steps**

1. `src/features/recorder/mime.ts`: `pickMimeType(isSupported = MediaRecorder.isTypeSupported.bind(MediaRecorder)): string | undefined`. Try in order: `'audio/webm;codecs=opus'`, `'audio/mp4;codecs=mp4a.40.2'`, `'audio/mp4'`, `'audio/ogg;codecs=opus'`; return the first supported, else `undefined` (then construct `MediaRecorder` without `mimeType`). Also `extensionFor(mime)` → `'webm' | 'm4a' | 'ogg' | 'audio'`. Always store `recorder.mimeType` (what the browser actually used), not the requested one.
2. `src/features/recorder/resample.ts`: `createStreamingResampler(inputRate: number, outputRate = 16000)` returns `{ push(input: Float32Array): Float32Array; }` using linear interpolation, carrying the fractional read position and the last input sample across calls, so pushing a signal in pieces gives the same output as pushing it whole (within 1e-6). If `inputRate === outputRate`, return a copy. For downsampling ratios > 2, apply a simple moving-average pre-filter of width `Math.round(ratio)` before interpolation (also stateful across calls).
3. `src/features/recorder/pcmBuffer.ts`: `class PcmBuffer` with `append(samples)`, `length`, `slice(start, end)` (copy), `toFloat32Array()` (copy), `durationSec(sampleRate=16000)`; capacity doubles starting at 16000 × 30 samples.
4. `src/features/recorder/pcm-capture.worklet.ts` (verified pattern): declares `AudioWorkletProcessor`/`registerProcessor` locally (they are not in `lib.dom`), buffers input channel 0 into a 2048-sample `Float32Array`, and posts it via `this.port.postMessage(buf, [buf.buffer])` when full. `process()` returns `true`.
5. In `recorder.ts`, import the worklet URL as `import workletUrl from './pcm-capture.worklet.ts?worker&url';` (verified: Vite 8 compiles it to `assets/pcm-capture.worklet-<hash>.js`; a plain `new URL('./x.ts', import.meta.url)` would copy the raw `.ts` file into `dist` and break in production).
6. `src/features/recorder/recorder.ts`: `startRecording(opts: { onPcm16k(samples: Float32Array): void; onChunk(blob: Blob, index: number, mimeType: string): void }): Promise<RecordingHandle>`. Order inside (all of it must run from the click/keydown handler's call stack up to the first `await`; see pitfall 13.6):
   1. `const ctx = new AudioContext();` then `void ctx.resume()` **before** any `await`.
   2. `await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })`.
   3. `await ctx.audioWorklet.addModule(workletUrl)`; create `MediaStreamSource`, `AnalyserNode` (`fftSize = 2048`, `smoothingTimeConstant = 0.8`), `AudioWorkletNode(ctx, 'pcm-capture')`. Connect source → analyser and source → worklet. Do **not** connect anything to `ctx.destination` (feedback).
   4. Resampler from `ctx.sampleRate` to 16000 feeding `onPcm16k`.
   5. `MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined)`, `start(1000)`; `ondataavailable` → `onChunk` if `size > 0`.
   6. Return `{ analyser, mimeType, startedAt, stop(): Promise<{ durationMs }>, cancel() }`. `stop()` waits for the recorder's `stop` event, stops all tracks, disconnects nodes, `await ctx.close()`.
      Errors: map `NotAllowedError`/`SecurityError` → `'permission-denied'`, `NotFoundError`/`OverconstrainedError` → `'no-microphone'`, `NotReadableError` → `'mic-busy'`, missing `navigator.mediaDevices` → `'insecure-context'`. Throw a typed `RecorderError { code, message }`.
7. `src/features/recorder/useRecorder.ts`: state machine `'idle' | 'requesting' | 'recording' | 'stopping' | 'error'`; exposes `start()`, `stop()`, `elapsedMs` (updated every 250 ms), `error`, `analyser`. Auto-stops at `MAX_RECORDING_SEC`. In M1 keep PCM in a `PcmBuffer` and chunks in memory (Dexie arrives in M4).
8. `src/features/recorder/useSpaceToggle.ts`: on `document` `keydown`, if `e.code === 'Space' && !e.repeat` and the target is **not** `input, textarea, select, button, [contenteditable], [role="textbox"]` (use `closest`), call `preventDefault()` and toggle. (A focused button already toggles on Space by itself; handling it twice would start and immediately stop.)
9. `src/features/recorder/RecordButton.tsx`: one `<button type="button">`, min 72×72 px, `aria-pressed={recording}`, `aria-label` = `"Start recording"` / `"Stop recording"`, visible text label under it ("Record" / "Stop" + elapsed time). Disabled with `aria-disabled` + explanation text when the model is not ready (from M2 on; in M1 always enabled). Breathing ring: CSS keyframe on a pseudo-element, 2.4 s ease-in-out infinite, **only** while recording; reduced motion stops it (the global rule in 6.9 does that).
10. `src/features/recorder/Waveform.tsx`: `<canvas>` sized to its container with `devicePixelRatio`, drawn in `requestAnimationFrame` from `analyser.getByteTimeDomainData`. Cancel rAF on unmount and when `analyser` is null. `role="img"` and `aria-label="Live audio level"`. With `matchMedia('(prefers-reduced-motion: reduce)')` true, draw a single level bar (RMS) at most 4 times per second instead of the moving line.
11. `src/features/recorder/RecorderPanel.tsx`: RecordButton + Waveform + timer + an `<audio controls>` for the last clip (object URL from the concatenated chunks; revoke it on replace/unmount) + error message area (`role="alert"`) with per-code text:
    - permission-denied: "Microphone access is blocked. Allow it in your browser's site settings, then try again."
    - no-microphone: "No microphone found."
    - mic-busy: "Your microphone is in use by another app."
    - insecure-context: "Recording needs a secure connection (https or localhost)."
12. Render `RecorderPanel` in `App.tsx`. Wire `useSpaceToggle`.
13. Unit tests: `mime.test.ts`, `resample.test.ts`, `pcmBuffer.test.ts`, `RecordButton.test.tsx` (labels, `aria-pressed`, click calls handler). E2E `recorder.spec.ts`: click "Start recording", wait 3 s, check the canvas has non-blank pixels (read via `page.evaluate` + `getImageData`), click "Stop recording", expect an `<audio>` whose `duration` > 2 (wait for `loadedmetadata`; WebM from MediaRecorder may report `Infinity` until seeked; accept `Infinity` or `> 2`). Also press Space with focus on `body` and assert the button toggles once.

**Acceptance**

```bash
npm run verify
npm run test:e2e -- recorder.spec.ts smoke.spec.ts
```

Manual (user, real mic): `npm run dev`, record 5 s of speech, waveform moves with the voice, playback is audible.

**Done when**

- All unit tests and the two e2e specs pass.
- Denying mic permission (Chrome site settings) shows the permission message, and the app keeps working.
- No console errors during record/stop/playback.

**On-track checklist (M1)**

- [ ] `grep -rn "localStorage" src` matches only `src/app/theme.ts`.
- [ ] `grep -rn "new AudioContext" src` matches only `recorder.ts`.
- [ ] Record → stop → record again works three times in a row (no leaked tracks: the browser's mic indicator turns off after each stop).
- [ ] Space with focus on the record button toggles exactly once.
- [ ] Report; ask whether to commit.

### M2: Worker and Whisper

**Goal:** model downloads with progress, a clear ready state, and a fixture clip transcribes correctly.

**Steps**

1. Create `config.ts` (7.1) and `protocol.ts` (7.2).
2. Create `src/workers/whisper.worker.ts` (7.3).
3. `src/features/transcribe/whisperClient.ts`: module-level singleton. `getWhisperClient()` lazily creates **the** worker with exactly
   `new Worker(new URL('../../workers/whisper.worker.ts', import.meta.url), { type: 'module' })`
   (Vite only detects this literal form). It exposes `probe()`, `load()`, `transcribe(kind, audio) → Promise<Result>` (resolves by `id`), and `subscribe(listener)` for progress/ready/error. The worker is never terminated by React effects.
4. `src/features/transcribe/useTranscriber.ts`: status `'probing' | 'needs-download' | 'loading' | 'ready' | 'error'`, `progress` (0 to 100), `device`, `approxDownloadMB`. On mount: `probe()`; if `cached` → `load()` automatically; else status `needs-download`.
5. `src/features/transcribe/ModelStatus.tsx`:
   - needs-download: text "Transcription runs on your device. It needs a one-time download of about {N} MB." + button "Download model".
   - loading: `ProgressBar` (`role="progressbar"`, `aria-valuenow`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-label="Model download"`) + "{loaded} of {total}" via `formatBytes`.
   - ready: "Ready. Running on {GPU | CPU (slower on this device)}." for webgpu | wasm.
   - error: message + "Try again" button (calls `load()` again).
     Put this region in an `aria-live="polite"` container; announce only status changes, not every progress tick.
6. Gate `RecordButton` on `status === 'ready'`.
7. After `stop()`, send the full PCM buffer as `final`; show the text under the recorder (no saving yet).
8. Create `src/design/components/ProgressBar.tsx` and `Button.tsx` using tokens only.
9. E2E `transcribe.spec.ts`: `test.skip(!existsSync('tests/fixtures/speech.wav'), 'needs macOS say')`. Open `/`, click "Download model" if visible, wait (≤ 150 s) for text "Ready", start recording, wait 4 s, stop, expect the transcript to contain (case-insensitive) `quick brown fox` and `lazy dog`. The fake mic loops the 2.5 s file, so the text may repeat; assert with `toContainText`, never exact equality.

**Acceptance**

```bash
npm run verify
npm run test:e2e -- transcribe.spec.ts
grep -l "onnxruntime" dist/assets/*.js   # must print only dist/assets/whisper.worker-<hash>.js
```

**Done when**

- First run shows the download prompt and real byte progress; after reload, it goes straight to "Ready" with no network requests to `huggingface.co` (check DevTools Network; files come from the Cache API).
- `transcribe.spec.ts` passes in headless Chromium (WASM path; headless has no WebGPU adapter).
- On a WebGPU machine (user's Chrome), `ModelStatus` says "GPU" and a 10 s clip transcribes correctly. If WebGPU produces an error or empty text, the worker falls back to WASM and says "CPU".
- `check:bundle` passes.

**On-track checklist (M2)**

- [ ] `grep -rn "@huggingface/transformers" src` matches only `src/workers/whisper.worker.ts`.
- [ ] `grep -rn "new Worker" src` matches only `whisperClient.ts`.
- [ ] In dev (StrictMode), DevTools > Sources shows one `whisper.worker` thread, not two.
- [ ] DevTools > Application > Cache Storage shows `transformers-cache` with the two `.onnx` files and the ORT `.wasm`.
- [ ] Report; ask whether to commit.

### M3: Streaming transcript

**Goal:** live text appears while recording; the final text comes from a full pass.

**Steps**

1. Implement `merge.ts` (7.4) and `tests/unit/merge.test.ts` first (cases in section 10). Make the tests pass before wiring the UI.
2. Extend `useTranscriber` with `startLive(getPcm: () => PcmBuffer)`/`stopLive()` that run the live loop from 7.4 (`setInterval(LIVE_TICK_MS)`; clear it on stop/unmount).
3. `src/features/transcribe/LiveTranscript.tsx`: committed text in `--vn-fg`, tentative text in `--vn-fg-muted` and italic. Container `aria-live="polite"` with `aria-atomic="false"`; only committed text is announced (put tentative text in a sibling with `aria-hidden="true"`). Fade new committed text in over `--vn-dur-base` (opacity only).
4. On stop: show "Finishing transcript…" until the `final` result arrives, then replace the live text with the final text.
5. E2E: extend `transcribe.spec.ts`: after 6 s of recording (before stop), expect the live region to contain `fox` (case-insensitive).

**Acceptance**

```bash
npm run verify
npm run test:e2e -- transcribe.spec.ts
```

**Done when**

- `merge.test.ts` covers every rule in 7.4 and passes.
- Live text appears within about 4 s of speech starting (WASM, desktop).
- Live requests never pile up: with a slow device, at most one live request is in flight (log `ms` from results in dev).

**On-track checklist (M3)**

- [ ] A 60 s recording keeps the UI responsive (waveform stays smooth while live passes run).
- [ ] `[BLANK_AUDIO]` never appears in the UI during silence.
- [ ] Report; ask whether to commit.

### M4: Notes and storage

**Goal:** recordings become notes that survive reloads, with audio.

**Steps**

1. Create `src/storage/db.ts`, `notes.ts`, `audio.ts` (7.5).
2. `tests/unit/storage.test.ts` with `// @vitest-environment node` as its **first line** (pitfall 13.10). Use `new VoiceNotesDB('test-' + crypto.randomUUID())` per test. Cases in section 10.
3. Recorder: `onChunk` → `appendChunk(sessionId, index, blob, mimeType)` (sessionId = `crypto.randomUUID()` per recording).
4. `src/features/notes/title.ts`: `titleFromTranscript(text, createdAt)`: first sentence (split on `. ! ?`), trimmed, max 60 chars on a word boundary + `…`; if empty → `"Note, " + formatDate(createdAt)`.
5. `src/features/notes/transcriptToDoc.ts`: `transcriptToDoc(text)` → Tiptap JSON `{ type: 'doc', content: paragraphs }`, a new paragraph about every 3 sentences; empty text → one empty paragraph.
6. Save flow (on `final` result): `createNote(...)` → `finalizeSession(sessionId, note.id)` → set `note.audioId` → navigate to `#/note/<id>`. If the final transcription errors, still save the note with empty text and show "Transcription failed. The audio is saved."
7. Recovery: on app start, `listOrphanSessions()`; for each, show a toast "Recovered an unsaved recording" with buttons "Keep" (create a note with title "Recovered recording", no transcript, `finalizeSession`) and "Discard" (`discardSession`).
8. `src/app/router.ts`: `useHashRoute()` → `{ name: 'home' } | { name: 'note', id }`, listening to `hashchange`. `navigate(path)` sets `location.hash`.
9. `src/features/notes/NotesList.tsx`: `useLiveQuery(listNotes)`; each item is a link (`<a href="#/note/<id>">`) showing the title (serif), date, duration, and a 2-line preview of `plainText`. Empty state: "No notes yet. Press Record or Space to start." List is a `<ul>` with `aria-label="Notes"`.
10. `src/features/notes/NotePage.tsx` (M4 version): title, date, `<audio controls>` from the stored blob, plain transcript text, "Delete" button. Delete → `deleteNote` → navigate home → `Toast` "Note deleted" with "Undo" (6 s, `role="status"`), Undo → `restoreNote`.
11. `src/design/components/Toast.tsx`: one toast at a time, auto-dismiss, pauses while hovered or focused, Escape closes.
12. After the first note is saved, call `navigator.storage.persist?.()` once (ignore the result).
13. E2E `notes.spec.ts`: record → stop → lands on the note page → reload → note still there with audio `duration` > 0 → go home → list shows it → delete → Undo → still listed → delete again → wait 7 s → gone after reload.

**Acceptance**

```bash
npm run verify
npm run test:e2e -- notes.spec.ts
```

**Done when**

- Notes and audio survive reload; delete with undo works; orphan recovery works (simulate: reload during recording).
- `storage.test.ts` passes, including the Blob round-trip.

**On-track checklist (M4)**

- [ ] DevTools > Application > IndexedDB > `voice-notes` shows `notes`, `audio`, `audioChunks`; `audioChunks` is empty after a normal stop.
- [ ] `grep -rn "version(" src/storage` shows only `version(1)`.
- [ ] Report; ask whether to commit.

### M5: Editor and export

**Goal:** edit notes in Tiptap with autosave; export `.md` and `.txt`.

**Steps**

1. `src/lib/debounce.ts`: `debounce(fn, ms)` with `.flush()` and `.cancel()`.
2. `src/features/notes/NoteEditor.tsx`:
   ```ts
   const editor = useEditor({
     extensions: [
       StarterKit.configure({ heading: { levels: [2, 3] } }),
       Placeholder.configure({ placeholder: 'Start typing…' }),
       Markdown,
     ],
     content: JSON.parse(note.contentJson),
     editorProps: {
       attributes: { 'aria-label': 'Note text', class: '<prose classes using tokens>' },
     },
     onUpdate: ({ editor }) => save(editor),
   });
   ```
   Imports: `useEditor, EditorContent, useEditorState` from `@tiptap/react`; `StarterKit` from `@tiptap/starter-kit`; `Placeholder` from `@tiptap/extensions`; `Markdown` from `@tiptap/markdown`. `save` is `debounce(500)` and writes `contentJson`, `plainText = editor.getText()`, `title` (from the first line if the user edited it, else keep). Flush on unmount, on `visibilitychange` to hidden, and on `pagehide`.
   Toolbar (Bold, Italic, H2, Bulleted list): `useEditorState` for active states (Tiptap v3 does not re-render on every transaction by default), each button with `aria-pressed` and `aria-label`.
   Pass `key={note.id}` to the editor component so switching notes creates a fresh editor.
3. Make `NotePage` lazy: in `App.tsx`, `const NotePage = lazy(() => import('./features/notes/NotePage'))` inside `<Suspense fallback={<p>Loading…</p>}>`. `NotePage.tsx` must have a **default** export.
4. `src/features/notes/exportNote.ts`: `fileNameFor(title, createdAt, ext)` → lowercase slug of the title (a-z0-9 and `-`, max 50 chars) + `-YYYY-MM-DD.<ext>`; `downloadText(name, text, mime)` creates a Blob URL, clicks a temporary `<a download>`, revokes after 1 s. `.md` = `editor.getMarkdown()`; `.txt` = `editor.getText()`.
5. Export menu: two buttons "Export .md" and "Export .txt" (no dropdown component needed).
6. Unit tests: `exportNote.test.ts` (`fileNameFor` cases) and `transcriptToDoc.test.ts`.
7. E2E (extend `notes.spec.ts`): type " Edited." at the end of the editor, wait 1 s, reload, text persists; click "Export .md", `page.waitForEvent('download')`, check `suggestedFilename()` ends with `.md` and the file content contains `Edited.`.

**Acceptance**

```bash
npm run verify
npm run test:e2e -- notes.spec.ts
```

**Done when**

- Edits autosave and survive reload; both exports download with correct names and content.
- `check:bundle`: Tiptap is **not** in the entry chunk (`grep -l "prosemirror" dist/assets/index-*.js` prints nothing).

**On-track checklist (M5)**

- [ ] In dev (StrictMode), the editor shows one toolbar and one content area (no doubled editor).
- [ ] Typing fast for 10 s causes at most about 20 IndexedDB writes (debounce works).
- [ ] Report; ask whether to commit.

### M6: Offline and PWA

**Goal:** after the first run, the app (shell, model, notes) works with no network.

**Steps**

1. Confirm `vite.config.ts` matches 6.2 (no `runtimeCaching`).
2. `UpdatePrompt` from M0 is mounted in `App.tsx`.
3. Add an offline indicator: listen to `online`/`offline` events; when offline show a small "Offline" pill in the header (`role="status"`).
4. Storage view (small, in a settings section or footer): `estimateUsage()` → "Using {usage} of {quota}". Hide it if `null`.
5. E2E `offline.spec.ts` (Chromium):
   1. Go to `/`, wait for `navigator.serviceWorker.ready` via `page.evaluate`, then reload once so the page is controlled.
   2. Download the model if needed and wait for "Ready" (model now in Cache API).
   3. `await context.setOffline(true)`; `await page.reload()`.
   4. Expect heading "Voice Notes" and "Ready" (model loaded from cache).
   5. Record 4 s, stop, expect transcript contains `fox`, expect the note to appear in the list.
6. E2E installability check inside `offline.spec.ts`: fetch `/manifest.webmanifest`, assert `name`, `start_url`, `display: 'standalone'`, a 192 and a 512 icon, and a `maskable` icon.

**Acceptance**

```bash
npm run verify
npm run test:e2e -- offline.spec.ts
```

Manual (user): Chrome DevTools > Application > Manifest shows no installability errors; the install icon appears in the address bar. Lighthouse no longer has a PWA category (removed in Lighthouse 12), so this replaces the "Lighthouse PWA check".

**Done when**

- `offline.spec.ts` passes.
- `dist/sw.js` precache list contains `index.html`, the entry JS, `whisper.worker-*.js`, `pcm-capture.worklet-*.js`, CSS, icons; it contains no `.onnx` or `.wasm` (`check:bundle` enforces this).

**On-track checklist (M6)**

- [ ] The `dist/assets/ort-wasm-simd-threaded.asyncify-*.wasm` file (about 26 MB) exists in `dist` but is **not** in the precache. This is expected: ORT's code references it, but at runtime transformers.js loads the wasm from jsdelivr and caches it (pitfall 13.3).
- [ ] Building twice and serving shows the "A new version is ready" toast only when something changed.
- [ ] Report; ask whether to commit.

### M7: Design pass

**Goal:** dark mode, reduced motion, phone width, accessibility: all checked and polished.

**Steps**

1. Run `impeccable` with `critique` on the home screen and the note screen, then `polish`. Apply fixes that stay inside the tokens and the Do NOT list. Update `DESIGN.md` with `impeccable document` if tokens changed.
2. Run `ui-ux-pro-max` review guidance for: touch targets (≥ 44×44 px), contrast, focus states, reduced motion, heading order.
3. Motion (CSS only): record ring 2.4 s breathing; state changes 150 to 250 ms using `--vn-dur-fast`/`--vn-dur-base` and `--vn-ease`; transcript fade-in opacity only. Animate only `opacity` and `transform`.
4. Phone width: check 375×812 in Playwright (`page.setViewportSize`) and in DevTools: no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), record button reachable with the thumb (bottom half on narrow screens), safe-area insets with `env(safe-area-inset-bottom)`.
5. Write `tests/e2e/a11y.spec.ts`: for `/` and a note page, in light and dark (`page.emulateMedia({ colorScheme })`), run `new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa']).analyze()` and expect zero violations with impact `serious` or `critical`. Also: reduced motion (`page.emulateMedia({ reducedMotion: 'reduce' })`) → the record ring's computed `animation-duration` is ≤ `0.01ms` while recording; viewport 375 px → no horizontal scroll.

**Acceptance**

```bash
npm run verify
npm run test:e2e -- a11y.spec.ts
```

**Done when**: section 11 criteria all hold.

**On-track checklist (M7)**

- [ ] No hex colors in `src/**/*.tsx` (`grep -rnE "#[0-9a-fA-F]{3,6}\b" src --include=*.tsx` prints nothing). Colors come from tokens.
- [ ] Dark mode is hand-tuned (accent is lighter in dark, surfaces are not pure black).
- [ ] Report; ask whether to commit.

### M8: Tests and docs

**Goal:** full suite green; README for a portfolio.

**Steps**

1. Fill any missing unit tests from section 10. Do not add coverage reporting: it needs `@vitest/coverage-v8`, which is not in the dependency list.
2. Run the whole e2e suite: `npm run test:e2e`.
3. Write `README.md`: what it is, privacy statement (what goes over the network: the one-time model download from huggingface.co and the ORT runtime from cdn.jsdelivr.net; nothing else), requirements (Node ≥ 24.15), setup commands, scripts table, architecture (copy the 5.1 diagram), model and versions table (`MODEL_ID`, dtypes, sizes, `@huggingface/transformers@4.3.1`), browser support notes (section 13), testing (fixture generation needs macOS `say`), credits (inspired by addyosmani/say, MIT; no code copied), screenshots.
4. Screenshots: add `tests/e2e/screenshots.spec.ts` that saves `docs/screenshots/home-light.png`, `home-dark.png`, `note-light.png`, `phone-dark.png` (375×812) with `page.screenshot`. Run it once, reference the images in the README. (It is a utility spec; mark it `test.describe.configure({ mode: 'serial' })` and skip unless `process.env.SCREENSHOTS === '1'`.)

**Acceptance**

```bash
npm run verify
npm run test:e2e
SCREENSHOTS=1 npx playwright test screenshots.spec.ts
```

**Done when**: everything is green, the README renders correctly on GitHub (relative image paths), and section 11 holds.

**On-track checklist (M8)**

- [ ] A fresh clone works: `rm -rf node_modules dist && npm ci && npm run verify`.
- [ ] Report; ask whether to commit.

---

## 9. Design system step (M0 step 9)

**Skills:** `impeccable` (direction, PRODUCT.md, DESIGN.md) and `ui-ux-pro-max` (palette, type, UX rules). Invoke them with the Skill tool, in this order.

**Inputs to give both skills (copy this brief):**

> Product: "Voice Notes", a private, offline-first voice notes web app. Record speech, see a live on-device transcript, edit notes. Mode: Operate (app UI), mobile-first. Mood: calm, editorial, warm. Palette: warm neutrals with exactly one accent (used for the record button and focus/active states). Typography: a serif for note titles, a clean sans for UI. **Constraint: system font stacks only, no web fonts.** Recording state is the hero: big round record button with a slow breathing ring, waveform below. Motion 150 to 250 ms, respects reduced motion. Dark mode is first-class and hand-tuned, not inverted. Must meet WCAG 2.2 AA contrast. Stack: React 19 + Tailwind v4 (tokens as CSS variables, mapped with `@theme inline`).

**Order**

1. `impeccable` → `init`: writes `PRODUCT.md` at the project root. (If its launcher fails, it says so and continues by reading files; that is fine.)
2. `ui-ux-pro-max`: run
   `python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "voice notes journaling calm editorial warm minimal" --design-system --persist -p "Voice Notes" --output-dir "/Users/hardik/Projects/voice-notes"`
   This writes `design-system/voice-notes/MASTER.md`. If `python3` is missing, stop and ask the user (the skill forbids installing it).
3. `impeccable` → direction for the home (recorder + list) and note screens; then write `src/design/tokens.css` and `DESIGN.md` (via `impeccable document`).
4. If the two skills disagree, the **brief above wins**, then `impeccable`'s direction, then `ui-ux-pro-max`'s palette.

**Output contract: `src/design/tokens.css`** (the only file the skills may change in `src/`)

- Structure, in this exact order and with these exact selectors (the contrast script depends on them):
  1. `:root { ... }` with **all** tokens (light values).
  2. `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) { ...dark color tokens... } }`
  3. `:root[data-theme='dark'] { ...the same dark color tokens, identical values... }`
- Colors are **6-digit hex** only. Required names:

| Token                                                                               | Meaning                                                                        |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `--vn-bg`                                                                           | Page background                                                                |
| `--vn-surface`                                                                      | Cards, editor, panels                                                          |
| `--vn-fg`                                                                           | Primary text                                                                   |
| `--vn-fg-muted`                                                                     | Secondary text (≥ 4.5:1 on bg and surface)                                     |
| `--vn-border`                                                                       | Hairlines and dividers                                                         |
| `--vn-accent`                                                                       | Record button, active states (≥ 3:1 on bg)                                     |
| `--vn-accent-fg`                                                                    | Text/icon on accent (≥ 4.5:1)                                                  |
| `--vn-danger`                                                                       | Delete and errors (≥ 4.5:1 on bg)                                              |
| `--vn-focus`                                                                        | Focus ring (≥ 3:1 on bg)                                                       |
| `--vn-font-sans`                                                                    | e.g. `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` |
| `--vn-font-serif`                                                                   | e.g. `ui-serif, 'New York', 'Iowan Old Style', Georgia, serif`                 |
| `--vn-text-xs` … `--vn-text-2xl`                                                    | Type scale, 6 steps, `rem`, body = `1rem`                                      |
| `--vn-leading-body`                                                                 | 1.5 to 1.6                                                                     |
| `--vn-space-1` … `--vn-space-8`                                                     | 4 px based scale in `rem`                                                      |
| `--vn-radius-sm`, `--vn-radius-md`, `--vn-radius-lg`                                | Corner radii                                                                   |
| `--vn-dur-fast` (150ms), `--vn-dur-base` (200 to 250ms), `--vn-dur-breath` (2400ms) | Durations                                                                      |
| `--vn-ease`                                                                         | e.g. `cubic-bezier(0.2, 0, 0, 1)`                                              |
| `--vn-shadow-sm`, `--vn-shadow-md`                                                  | Elevation (may differ in dark)                                                 |

- Done when `npm run check:contrast` prints only `PASS` and `DESIGN.md` records the palette, type, and motion choices with one line of reasoning each.

**UI toolkit (other skills)**

| Skill           | Use                                                                                                                         | When       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `ui-ux-pro-max` | Palette, type, UX rules                                                                                                     | M0, M7     |
| `impeccable`    | Direction, critique, polish, DESIGN.md                                                                                      | M0, M7     |
| `motion`        | Guidance only for CSS transitions/keyframes. Do not install `motion`                                                        | M1, M3, M7 |
| `21st:21st-ui`  | Reference markup for list items, empty states, toasts. Port by hand to plain React + tokens. Never run its install commands | M4+        |

---

## 10. Testing strategy

| Layer                                                                               | Tool / env                                                                             | What                                                                                                                                 |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Pure logic                                                                          | Vitest, jsdom (default)                                                                | `format.ts`, `resample.ts`, `pcmBuffer.ts`, `mime.ts`, `merge.ts`, `title.ts`, `transcriptToDoc.ts`, `exportNote.ts` (`fileNameFor`) |
| Storage                                                                             | Vitest, **node** env (`// @vitest-environment node` on line 1) + `fake-indexeddb/auto` | `notes.ts`, `audio.ts`                                                                                                               |
| Components                                                                          | Vitest, jsdom + Testing Library                                                        | `RecordButton` (labels, `aria-pressed`, disabled state)                                                                              |
| Browser APIs (mic, AudioWorklet, MediaRecorder, Worker, WebGPU/WASM, Cache API, SW) | Playwright Chromium, fake mic                                                          | All e2e specs                                                                                                                        |

**Required unit cases**

- `format`: 0 → `0:00`; 65 000 → `1:05`; 3 600 000 → `1:00:00`; `formatBytes(12_345_678)` → `12.3 MB`.
- `resample`: 48 k → 16 k output length = `round(n / 3)` (±1); a 440 Hz sine keeps its frequency (zero crossings count within 2%); pushing in 7 random-sized pieces equals pushing whole (max abs diff < 1e-6); 16 k → 16 k is a copy.
- `pcmBuffer`: append beyond initial capacity; `slice` returns a copy (mutating it does not change the buffer).
- `mime`: with a stub that supports only `audio/mp4` → `audio/mp4`; supports nothing → `undefined`; `extensionFor('audio/webm;codecs=opus')` → `webm`.
- `merge`: short window → only tentative; 22 s window with chunks ending at 5, 12, 18.5, 21 → commits first three, `committedUntilSec = windowStart + 18.5`, tentative = 4th; chunk with `end: null` never committed; 28 s window with one null-end chunk → force-commits as one segment; `[BLANK_AUDIO]` dropped; input state not mutated.
- `title`: long sentence truncated at a word boundary with `…`; empty → `Note, <date>`.
- `transcriptToDoc`: empty → one empty paragraph; 7 sentences → 3 paragraphs.
- `exportNote.fileNameFor`: `"Hello, World!"` → `hello-world-2026-10-20.md`; title of only symbols → `note-2026-10-20.md`.
- `storage`: create/get/list order; update sets `updatedAt`; delete returns records and removes both; restore brings both back; chunks finalize into one Blob whose `size` equals the sum and `type` equals the mime; orphan sessions listed and discarded.

**Fixture audio plan**

- `scripts/make-fixture.mjs` (6.10) is the only source of test audio. It writes `tests/fixtures/tone.wav` everywhere and `tests/fixtures/speech.wav` on macOS using the built-in `say` command. Both are git-ignored and regenerated by `npm run test:e2e`.
- Transcription specs skip with a clear reason when `speech.wav` is missing (non-macOS CI). Recorder/waveform specs can use either file.
- Chromium loops the fake-mic file, so assertions use `toContainText` on key words (`fox`, `lazy dog`), never exact text.

**What is not automated (manual by the user)**: real-mic quality, iOS Safari, Firefox, WebGPU on real hardware, Lighthouse a11y/performance scores, installability prompt.

---

## 11. Accessibility and performance acceptance criteria

| #   | Criterion                                                                                                                                        | How it is checked                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| A1  | Space toggles recording when focus is not in an input, editor, or button; never double-toggles                                                   | `recorder.spec.ts`                                           |
| A2  | Every icon-only button has an `aria-label`; record button has `aria-pressed`                                                                     | `RecordButton.test.tsx`, axe                                 |
| A3  | Visible focus ring on every interactive element (`:focus-visible`, `--vn-focus` ≥ 3:1)                                                           | `check:contrast`, manual Tab pass                            |
| A4  | Text contrast ≥ 4.5:1 light and dark                                                                                                             | `check:contrast`, axe                                        |
| A5  | Live transcript and model status in `aria-live="polite"` regions; errors `role="alert"`                                                          | axe + code review                                            |
| A6  | `prefers-reduced-motion: reduce` stops the breathing ring and the moving waveform                                                                | `a11y.spec.ts`                                               |
| A7  | Touch targets ≥ 44×44 px (record button ≥ 72×72)                                                                                                 | manual + `a11y.spec.ts` bounding boxes for the record button |
| A8  | No horizontal scroll at 375 px; zoom not disabled                                                                                                | `a11y.spec.ts`, index.html check                             |
| A9  | Zero axe `serious`/`critical` violations on home and note pages, light and dark                                                                  | `a11y.spec.ts`                                               |
| P1  | Main entry chunk ≤ **150 kB gzip**                                                                                                               | `check:bundle` (trial scaffold entry: 67 kB gzip)            |
| P2  | `@huggingface/transformers`/onnxruntime only in `whisper.worker-*.js`                                                                            | `check:bundle`                                               |
| P3  | Model loads only in the worker; main thread never awaits inference                                                                               | grep checks in M2 checklist                                  |
| P4  | Tiptap is lazy-loaded (not in the entry chunk)                                                                                                   | M5 check                                                     |
| P5  | No `.onnx`/`.wasm` in the SW precache                                                                                                            | `check:bundle`                                               |
| P6  | Waveform drawing stays smooth while live transcription runs (no long tasks > 50 ms on the main thread caused by our code)                        | manual: DevTools Performance, 30 s recording                 |
| P7  | Lighthouse (manual, by the user, in Chrome DevTools): Accessibility ≥ 95, Best Practices ≥ 95, Performance ≥ 90 on desktop for `npm run preview` | manual                                                       |

---

## 12. "How to verify you are on track" (summary)

Each milestone has its own checklist above. In addition, after **every** milestone:

1. `npm run verify` exits 0.
2. `git status --short` lists only files named in this plan.
3. `grep -rn "@huggingface/transformers" src` → only the worker file.
4. `grep -rn "localStorage" src` → only `src/app/theme.ts`.
5. `npm ls --depth=0` shows no package missing from section 3 and none extra.
6. No `TODO` you added without telling the user.

---

## 13. Known pitfalls and how to avoid them

### 13.1 transformers.js v4 vs v2/v3

- **Package name:** `@huggingface/transformers` (v3+). `@xenova/transformers` is v2 and is not used.
- **Device:** `pipeline(task, model, { device: 'webgpu' | 'wasm' })`. v4 also lists `'auto'`, `'gpu'`, `'cpu'`, `'webnn*'`; we use only `'webgpu'` and `'wasm'`, chosen explicitly. (v2 had no `device` option.)
- **dtype:** `dtype` accepts a string or a per-module object. For Whisper, use the object with keys `encoder_model` and `decoder_model_merged`. v4 values: `auto, fp32, fp16, q8, int8, uint8, q4, bnb4, q4f16, q2, q2f16, q1, q1f16`. The v2 `quantized: true` option is gone. If you omit `dtype`, the WASM default is `q8` and everything else defaults to `fp32`.
- **Task name:** `'automatic-speech-recognition'` (alias `'asr'`). Input is `Float32Array` at 16 kHz mono (or a URL). Output `{ text, chunks? }`, chunk `timestamp: [start, end | null]`.
- **Progress:** v4 adds `status: 'progress_total'` with `{ progress, loaded, total, files }` across all files. Also `initiate`, `download`, `progress` (per file), `done`, `ready`. Use `progress_total` for the bar.
- **Cache:** `env.useBrowserCache` (default `true`) stores model files in Cache Storage under `env.cacheKey` (default `'transformers-cache'`). `env.useWasmCache` (default `true`) also caches the ORT wasm binary and factory. `ModelRegistry.is_pipeline_cached(task, modelId, { device, dtype })` reports whether all files are cached; `ModelRegistry.clear_pipeline_cache(...)` deletes them (useful for a "remove model" button in v1.1).
- **`env.allowLocalModels`:** in browsers it defaults to `false` in v4 (v2 defaulted to `true`, which caused 404 lookups on `/models/...` that Vite's SPA fallback answered with `index.html`, giving JSON parse errors). We still set it to `false` explicitly.
- **Package `exports`:** the `node` condition resolves to `transformers.node.mjs` and the default (browser) condition to `transformers.web.js`. Vitest runs in Node, so importing transformers in a unit test loads the Node build (needs `onnxruntime-node`, whose install script is not approved). **Never import the worker or transformers in unit tests.**
- **WebGPU dtype choice** (`fp32` encoder + `q4` decoder) is from the upstream example, not verified on real hardware here (headless has no adapter). If output is wrong or empty on a real GPU, try `fp16` for the encoder **only if** the adapter has `shader-f16`; otherwise use WASM.

### 13.2 Vite workers

- Use exactly `new Worker(new URL('../../workers/whisper.worker.ts', import.meta.url), { type: 'module' })`. Variables in place of the literal break Vite's detection.
- `worker: { format: 'es' }` is required: transformers uses dynamic imports, which the default `iife` worker format does not support with code splitting.
- AudioWorklets are not Web Workers: load them with `import url from './file.ts?worker&url'` and `audioWorklet.addModule(url)` (verified in build).

### 13.3 ORT wasm file in `dist`

The build emits `dist/assets/ort-wasm-simd-threaded.asyncify-<hash>.wasm` (about 26 MB). It is referenced by onnxruntime-web's code, but transformers.js sets `wasmPaths` to jsdelivr at runtime, so this file is not fetched. Leave it; do not add `wasm` to `globPatterns` (vite-plugin-pwa errors on files over 2 MiB, and it would bloat the SW). The worker chunk itself (about 550 kB) is precached, which is what offline needs.

### 13.4 WebGPU detection

`'gpu' in navigator` is not enough. Call `await navigator.gpu.requestAdapter()`; `null` means no WebGPU (verified in headless Chromium). Detect inside the worker (`WorkerNavigator.gpu`). Wrap in try/catch; on any WebGPU pipeline error, retry with WASM.

### 13.5 MediaRecorder MIME types

Chrome/Edge/Firefox record `audio/webm;codecs=opus` (Firefox can also do `audio/ogg;codecs=opus`). Safari records `audio/mp4` (AAC); newer Safari versions may also support WebM, so do not hard-code by browser. Always probe with `MediaRecorder.isTypeSupported` in the 1.1 order, and store `recorder.mimeType`. Headless Chromium reported support for both `audio/webm;codecs=opus` and `audio/mp4` (verified). WebM from MediaRecorder has no duration in its header; `<audio>.duration` may be `Infinity` until played or seeked. Use our stored `durationMs` in the UI.

### 13.6 AudioContext and user gestures

Create and `resume()` the `AudioContext` synchronously inside the click/keydown handler, before the first `await`. iOS Safari keeps it `suspended` otherwise. Do not create it at module load or in an effect.

### 13.7 Microphone permission

- `getUserMedia` exists only in secure contexts (`https://` or `localhost`). Testing on a phone over the LAN (`http://192.168.x.x`) fails; the user needs an HTTPS tunnel or deployment. Do not add an HTTPS plugin (not in the deps).
- Map errors as in M1 step 6. After a denial, the browser will not prompt again; tell the user how to re-enable it in site settings.
- Do not call `navigator.permissions.query({ name: 'microphone' })` as the only check; Safari/Firefox support for that name differs. Use it only as an optional hint in try/catch.

### 13.8 iOS Safari quirks

- Safari deletes script-writable storage (IndexedDB, Cache API) after 7 days without a visit for sites **not** added to the Home Screen. Call `navigator.storage.persist()` and tell users to add the app to the Home Screen. Mention it in the README.
- Memory is tight: 20-minute cap (`MAX_RECORDING_SEC`); 16 kHz Float32 PCM is about 77 MB at 20 min. Never keep 48 kHz PCM.
- Background tabs suspend audio and timers; if `visibilitychange` → hidden during recording, keep recording (MediaRecorder continues) but expect live transcription to pause.
- WebGPU in Safari is only on recent versions (transformers.js checks `IS_SAFARI_BELOW_26`); expect the WASM path on most iPhones.
- Use `env(safe-area-inset-*)` paddings; the record button must not sit under the home indicator.

### 13.9 Dexie schema versioning

- `version(n).stores()` strings list only the primary key and indexes. Non-indexed fields are stored without listing them.
- Never edit `version(1)` after it has been used. To change the schema, add `this.version(2).stores({...}).upgrade(tx => ...)` and keep version 1.
- Use one `db.transaction('rw', [tables], ...)` for multi-table writes (delete note + audio, finalize session).

### 13.10 IndexedDB blobs and tests

- IndexedDB stores Blobs fine in browsers; there is no per-blob limit, only the origin quota (`navigator.storage.estimate()`). Store compressed MediaRecorder audio (32 kbps opus ≈ 14 MB/hour), never raw PCM.
- **In Vitest's jsdom environment, Blobs do not survive fake-indexeddb** (the jsdom `Blob` is not structured-cloneable by Node; it comes back as `{}`, verified). Storage tests must start with `// @vitest-environment node`, where Node's native `Blob` round-trips (verified).

### 13.11 Service worker and large files

- Precache only the app shell (`globPatterns` in 6.2). The model and ORT wasm are cached by transformers.js in Cache Storage; the SW must not touch them (Do NOT #9, #10).
- `devOptions.enabled: false`: the SW does not run in `npm run dev`. Test offline only with `npm run build && npm run preview`.
- `registerType: 'prompt'` + `UpdatePrompt`: never auto-reload while the user is recording or editing.

### 13.12 Tailwind v4

- No `tailwind.config.js`, no PostCSS config. `@import 'tailwindcss'` in CSS and the `@tailwindcss/vite` plugin.
- Tokens via `@theme inline` mapping to `var(--vn-*)` (6.9). Class-based dark mode via `@custom-variant dark (...)`.
- There is no `--duration-*` namespace: use `duration-(--vn-dur-fast)`.
- Tailwind v4 scans source files automatically; class names must be complete strings (no `'bg-' + color`).

### 13.13 Tiptap v3 in React

- Client-only app: keep `useEditor`'s default `immediatelyRender: true` (the `false` setting is for SSR).
- v3 does not re-render on every transaction by default; use `useEditorState` for toolbar state.
- `Placeholder` comes from `@tiptap/extensions`. StarterKit v3 already includes Link, Underline, and UndoRedo: do not add them separately (duplicate extension warnings).
- StrictMode double-mount: `useEditor` handles it. Never create `new Editor()` yourself in an effect.
- `editor.getMarkdown()` exists only when the `Markdown` extension from `@tiptap/markdown` is registered.
- `eslint-plugin-react-hooks@7` includes React Compiler rules (`refs`, `set-state-in-effect`, `incompatible-library`, `purity`). Fix the code they flag; do not disable rules globally. If `incompatible-library` flags `useEditor`, add a one-line `// eslint-disable-next-line react-hooks/incompatible-library` with a reason comment, and only there.

### 13.14 Vitest: jsdom vs browser

jsdom has no `MediaRecorder`, `AudioContext`, `AudioWorklet`, `Worker` (as used here), WebGPU, Cache Storage, or canvas drawing (`getContext` returns `null`). Keep those behind modules that unit tests do not import, and cover them with Playwright. Vitest browser mode would need `@vitest/browser-playwright` (not in the deps); do not add it.

### 13.15 Playwright fake mic

Flags: `--use-fake-ui-for-media-stream` (auto-accept), `--use-fake-device-for-media-stream` (fake devices), `--use-file-for-fake-audio-capture=<absolute path to wav>` (the file loops). Also grant `permissions: ['microphone']`. Verified: the AudioWorklet received non-silent 48 kHz PCM (RMS ≈ 0.12) and MediaRecorder produced `audio/webm;codecs=opus` parts. These flags are Chromium-only; run e2e only in the `chromium` project.

### 13.16 Port 4173 is taken on this machine

A different app answered on `localhost:4173` during verification. Preview and e2e use `4391` with `strictPort: true` so a port clash fails loudly instead of testing the wrong app.

---

## 14. Features (unchanged)

**MVP (v1.0)**

1. Record with a big button and Space shortcut.
2. Live waveform driven by the real mic signal.
3. Live transcript that firms up as the model catches up.
4. Model download with a progress bar and a clear "ready" state.
5. Notes list, edit in a rich-text editor, delete with undo.
6. Autosave to IndexedDB.
7. Export a note as `.md` or `.txt`.
8. Works offline after first load.

**Advanced (v1.1)**

- Click a word to play the audio from that point (needs word timestamps; verify `return_timestamps: 'word'` support for the chosen export first).
- Full-text search across notes (`plainText`).
- Tags and pinned notes (Dexie `version(2)`).
- Language picker (multilingual model) and auto-detect.
- Keyboard shortcuts overlay.
- Storage usage view with per-note audio delete, and "Remove model" (`ModelRegistry.clear_pipeline_cache`).

## 15. Design direction (unchanged)

- Calm, editorial: a serif for note titles, a clean sans for UI, a warm neutral palette with one accent.
- The recording state is the hero: a slow-breathing ring around the record button and a waveform that reacts to the voice.
- Motion is purposeful and short (150 to 250 ms). Respect `prefers-reduced-motion`.
- Dark mode is a first-class theme, not an inversion.
- Empty states and the model-download state get as much care as the editor.
- Mobile-first layout, tested at phone width.

## 16. Risks and mitigations

- **Model size and first-load time.** WASM ≈ 80 MB, WebGPU ≈ 202 MB for `whisper-base`. User-initiated download with byte progress; cached afterwards. Switch `MODEL_ID` to `onnx-community/whisper-tiny.en` (≈ 45 MB WASM) if too slow.
- **WebGPU is uneven.** Adapter-based detection, automatic WASM fallback, honest "CPU (slower on this device)" label.
- **Live transcription quality.** Sliding window with guard band (7.4) plus a final full pass on stop.
- **Mobile Safari audio quirks.** Covered in 13.5 to 13.8; the user tests on a real iPhone at M1 (needs HTTPS).
- **Memory on long recordings.** 16 kHz PCM only, 20-minute cap, compressed audio streamed to `audioChunks`.
- **Model and library drift.** Exact pins (section 3) and `MODEL_ID` constant; record both in the README.
- **Third-party network at first run.** huggingface.co (model) and cdn.jsdelivr.net (ORT wasm). Self-hosting the wasm via `env.backends.onnx.wasm.wasmPaths` is a v1.1 option.

## 17. Open decisions (defaults chosen)

1. **Name:** "Voice Notes". Keep; rename later.
2. **Model:** `onnx-community/whisper-base` (multilingual), `language: 'english'` in v1. Fallback `whisper-tiny.en`.
3. **Deploy:** none in v1. Static hosting later (any static host with HTTPS).

## 18. Not verified (be careful here)

- WebGPU path (`fp32` encoder + `q4` decoder) on real hardware: headless Chromium has no adapter, so only the WASM path was run.
- Safari (macOS/iOS) and Firefox behavior: not run; guidance in section 13 is from documentation knowledge, not tests.
- `return_timestamps: 'word'` with `onnx-community/whisper-base`: not tested (deferred to v1.1).
- `context.setOffline(true)` fully covering service-worker fetches in Playwright 1.64: not run. If `offline.spec.ts` is flaky for that reason, report it; the manual DevTools "Offline" check is the fallback.
- Exact live-transcription latency on low-end devices.
- Download sizes are from the Hugging Face tree API (file sizes), rounded; actual transfer may differ slightly.

## Next step

Start M0 once you approve this plan.
