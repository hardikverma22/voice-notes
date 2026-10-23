# Phase 2: on-device semantic search

Goal: find notes by meaning, not only exact words, with results that link to the moment in
the recording. Everything runs in the browser; no generative model, so nothing is made up.

## Model choice (benchmark, October 2026)

`node scripts/bench-embeddings.mjs` embeds 24 short voice-note-style passages and asks 24
reworded questions (for example "when is my teeth check-up" for a dentist note). The data is
synthetic, written for the test, so treat it as a sanity check, not a quality guarantee.

| Model (q8)                            | Top-1 | Top-3 | MRR  | Download | Speed (Node CPU) |
| ------------------------------------- | ----- | ----- | ---- | -------- | ---------------- |
| Current keyword search                | 0/24  | n/a   | n/a  | 0        | n/a              |
| `Xenova/all-MiniLM-L6-v2`             | 23/24 | 23/24 | 0.97 | 23.7 MB  | 1.1 ms/passage   |
| `Xenova/bge-small-en-v1.5`            | 22/24 | 23/24 | 0.93 | 34.7 MB  | 1.5 ms/passage   |
| `Snowflake/snowflake-arctic-embed-xs` | 22/24 | 23/24 | 0.93 | 23.7 MB  | 0.7 ms/passage   |

All three are far ahead of keyword search for reworded questions and too close to separate on
this set. Proposed: **snowflake-arctic-embed-xs**. It is the smallest and fastest, is trained for
retrieval, and reads up to 512 tokens per chunk (MiniLM stops at 256), which suits longer
transcript chunks. MiniLM is the fallback if it misbehaves in the browser.

## Design

- **Worker:** a second Web Worker for embeddings, separate from Whisper, queued so the two
  models never run at once. WebGPU when available, WASM otherwise. Downloads on first search
  or in Settings, with progress, like the speech model.
- **Chunks:** a note is split into chunks of about 60–120 words. For notes with timestamps,
  chunks follow transcript segments, so each keeps a start time for click-to-play.
- **Index:** a new Dexie table `chunks` (`id`, `noteId`, `text`, `start`, `vector` as
  Float32Array, `model`, `contentHash`). Derived data only: it can be deleted and rebuilt, and
  is left out of backups.
- **Keeping it fresh:** re-index a note when its text changes (debounced, compared by hash) or
  its transcript finishes; delete chunks with the note. Indexing resumes after a reload.
- **Search:** brute-force cosine similarity over all vectors (fast enough for thousands of
  chunks), blended with the existing keyword match so exact words still rank first. Results show
  the matching passage, the note, and a play-from-here time.
- **Related notes:** average a note's chunk vectors and show the closest few notes on the note
  page.
- **Honesty:** results show as "Similar meaning" with no confidence scores dressed up as
  certainty, and weak matches below a threshold are hidden.
