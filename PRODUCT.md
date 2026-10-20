# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Confirmed in PLAN.md: React 19 + TypeScript, Vite 8, Tailwind CSS v4 (tokens as CSS variables mapped with `@theme inline`), Dexie for IndexedDB, Tiptap for the editor, vite-plugin-pwa for offline. Speech-to-text runs in a Web Worker with `@huggingface/transformers` (Whisper). Mobile-first web app, installable as a PWA.

## Users

Three audiences, all confirmed by the user:

- **Personal capture:** people jotting thoughts, ideas, journal entries, or reminders by voice, mostly on a phone.
- **Professionals taking notes:** people who dictate during meetings, interviews, or site visits and need searchable text afterward.
- **Writing by voice:** people who write more easily by speaking, or who can't type comfortably, and need private, reliable dictation.

## Product Purpose

Record speech, see a live transcript on the device, and keep the resulting notes in the browser. The app exists so that spoken notes are captured quickly and stay private. Success means a user can go from opening the app to a saved, editable note in a few taps, and the note is still there offline and after a reload.

## Positioning

Transcription runs entirely on the user's device. Audio, transcripts, and notes are never uploaded, and the app works offline after the first model download. A cloud dictation app cannot truthfully claim this.

## Operating Context

- Used on phones and laptops, often in motion or in a meeting, so the record control must be reachable with one thumb and usable without looking.
- Used in quiet and noisy places. The live transcript must make it obvious the app is listening and working.
- The first run downloads a speech model (tens to hundreds of MB depending on the model). Users need clear progress and a clear "ready" state.
- Some users have no WebGPU. The app falls back to WASM and says so honestly.

## Capabilities and Constraints

- Record audio, show a live waveform, show a live transcript, stop, and save the final transcript with the audio.
- Create, edit, search, and export notes (Markdown and plain text). Notes live in IndexedDB.
- Offline use after first load. Service worker must not precache the model files.
- No accounts, no sync, no cloud storage in v1. No deployment in v1.
- Model: `whisper-base` (multilingual), with `tiny.en` as a fallback if first-load time is too long. Exact sizes are still to be verified.
- Terminology: "note" for the saved item, "transcript" for the text, "recording" for the act of capturing.

## Brand Commitments

- Working name "Voice Notes". The user said it may change later, so keep the name in as few places as possible.
- Voice: calm, plain, respectful of privacy. Never alarmist, never salesy.
- Visual direction (confirmed by the user in the brief): warm neutrals with exactly one accent, a serif for note titles, a clean sans for UI, system font stacks only (no web fonts), a big round record button with a slow breathing ring as the hero, dark mode designed as a first-class theme.

## Evidence on Hand

- Reference app studied for the flow only: https://github.com/addyosmani/say (MIT). No code or visuals are copied.
- Speech recognition verified in headless Chromium with `whisper-base` on WASM: a spoken test sentence transcribed exactly.
- No user research, testimonials, customers, or performance benchmarks exist yet. Do not invent any.

## Product Principles

1. Privacy is structural, not a setting: data stays on the device by design.
2. Recording is the hero. Every screen should make the next recording one tap away.
3. Honest status: progress, offline state, and fallbacks are always visible, never hidden.
4. Calm over clever: restraint, plain language, and small motion.

## Accessibility & Inclusion

- WCAG 2.2 AA contrast for all text and controls, in both light and dark themes.
- Full keyboard use: Space starts and stops recording, and every control has a visible focus ring.
- Respect `prefers-reduced-motion`; all motion is 150 to 250 ms and can be removed.
- Touch targets at least 44 by 44 CSS pixels on phones.
- Works for people who speak more easily than they type, and for people who cannot type comfortably.
