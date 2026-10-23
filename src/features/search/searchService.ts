import { useEffect, useState } from 'react';
import { db, type SearchChunk } from '../../storage/db';
import {
  disableSearch,
  embed,
  enableSearch,
  initSearchModel,
  isSearchEnabled,
  whenEmbedReady,
} from './embedStore';
import {
  clearSearchIndex,
  getIndexState,
  startIndexer,
  stopIndexer,
  useIndexState,
} from './indexer';
import { noteVectors, rankChunks, relatedNotes, type Scored } from './rank';

/** On app start: resume search by meaning if it was turned on before. */
export function initSearch(): void {
  if (!isSearchEnabled()) return;
  initSearchModel();
  void whenEmbedReady()
    .then(startIndexer)
    .catch(() => undefined);
}

export function turnOnSearch(): void {
  enableSearch();
  void whenEmbedReady()
    .then(startIndexer)
    .catch(() => undefined);
}

/** Turns search off and deletes the index (it holds copies of note text). */
export async function turnOffSearch(): Promise<void> {
  stopIndexer();
  disableSearch();
  await clearSearchIndex();
}

export async function rebuildSearchIndex(): Promise<void> {
  await clearSearchIndex();
}

// All passages, read once per index version. Thousands of 384-number vectors fit easily.
let cache: { version: number; chunks: SearchChunk[] } | null = null;
async function allChunks(): Promise<SearchChunk[]> {
  const { version } = getIndexState();
  if (cache?.version !== version) cache = { version, chunks: await db.searchChunks.toArray() };
  return cache.chunks;
}

export async function searchByMeaning(query: string, exclude: Set<string>): Promise<Scored[]> {
  const [vector] = await embed([query], true);
  if (!vector) return [];
  return rankChunks(await allChunks(), vector, { exclude });
}

export type MeaningSearch =
  { status: 'off' | 'idle' | 'searching' } | { status: 'done'; results: Scored[] };

const MIN_QUERY_CHARS = 3;
const DEBOUNCE_MS = 250;

/** Results by meaning for the library search box, debounced, without the keyword hits. */
export function useMeaningSearch(
  query: string,
  keywordIds: string[],
  enabled: boolean,
): MeaningSearch {
  const [result, setResult] = useState<MeaningSearch>({ status: 'idle' });
  const { version } = useIndexState();
  const trimmed = query.trim();
  const excludeKey = keywordIds.join(',');

  useEffect(() => {
    if (!enabled || trimmed.length < MIN_QUERY_CHARS) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setResult({ status: 'searching' });
      searchByMeaning(trimmed, new Set(excludeKey ? excludeKey.split(',') : []))
        .then((results) => {
          if (!cancelled) setResult({ status: 'done', results });
        })
        .catch(() => {
          if (!cancelled) setResult({ status: 'idle' });
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, excludeKey, enabled, version]);

  if (!enabled) return { status: 'off' };
  if (trimmed.length < MIN_QUERY_CHARS) return { status: 'idle' };
  return result;
}

/** Notes closest in meaning to this one, once the index has it. */
export function useRelatedNotes(
  noteId: string,
  enabled: boolean,
): { noteId: string; score: number }[] {
  const [related, setRelated] = useState<{ noteId: string; score: number }[]>([]);
  const { version } = useIndexState();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void allChunks().then((chunks) => {
      if (!cancelled) setRelated(relatedNotes(noteId, noteVectors(chunks)));
    });
    return () => {
      cancelled = true;
    };
  }, [noteId, enabled, version]);
  return enabled ? related : [];
}
