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

## Design (as built)

- **Opt-in:** search by meaning is off until turned on (from the search box or Settings). The
  model then downloads once and loads from the browser cache on later visits. Turning it off
  deletes the index.
- **Worker:** `src/workers/embed.worker.ts`, separate from Whisper. It runs on the CPU (WASM):
  the model is small, and leaving the GPU to Whisper avoids the two competing for memory. The
  indexer waits while Whisper is busy (recording or transcribing).
- **Chunks:** a note is split into chunks of about 60–120 words. For notes with timestamps,
  chunks follow transcript segments, so each keeps a start time for click-to-play.
- **Index:** Dexie v4 tables `searchChunks` (`id`, `noteId`, `text`, `start`, `vector`) and
  `searchIndex` (`noteId`, `hash`). Derived data only: rebuilt at any time, left out of backups,
  and deleted together with its note.
- **Keeping it fresh:** re-index a note when its text changes (debounced, compared by hash) or
  its transcript finishes; delete chunks with the note. Indexing resumes after a reload.
- **Search:** brute-force cosine similarity over all vectors (fast enough for thousands of
  chunks). Exact keyword matches stay first; a "Similar meaning" section below adds notes the
  keyword search missed, each with the matching passage and a play-from-here time
  (`#/note/<id>?t=<seconds>`).
- **Thresholds** (`src/features/search/config.ts`): this model's scores sit in a narrow band,
  so a search result needs at least 0.53 and to be within 0.07 of the best match.
- **Search respects the library filters:** with a tag, Pinned or With audio filter on, both
  exact and similar-meaning results stay inside it.
- **Related notes:** average a note's chunk vectors, subtract the library's average note vector,
  and show up to three notes scoring at least 0.2 at the bottom of the note page. Without
  centring, any two short notes scored 0.66–0.80; with it, real pairs in the demo notes scored
  0.21–0.39 and the rest 0.12 or less. Needs 8 indexed notes before suggesting anything.
- **Demo data:** in dev builds, Settings › Developer adds 15 sample notes (tagged #demo) to try
  search with, and removes them again. Not part of production builds.
- **Honesty:** results show as "Similar meaning" with no confidence scores dressed up as
  certainty, and weak matches below a threshold are hidden.
