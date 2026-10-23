/**
 * Semantic search settings. Model chosen by scripts/bench-embeddings.mjs (docs/semantic-search.md).
 * Score thresholds were calibrated on that benchmark: right answers scored 0.47–0.68, the best
 * wrong passage 0.45–0.57, so a floor plus a window below the best match hides loose matches.
 */
export const EMBED_MODEL_ID = 'Snowflake/snowflake-arctic-embed-xs';
export const EMBED_TASK = 'feature-extraction';
export const EMBED_DTYPE = 'q8';
export const APPROX_EMBED_MB = 24;
/** The model is trained with this prefix on queries (not on passages). */
export const QUERY_PREFIX = 'Represent this sentence for searching relevant passages: ';

export const CHUNK_TARGET_WORDS = 80;
export const CHUNK_MAX_WORDS = 120;

export const MIN_SCORE = 0.53;
export const RELATIVE_WINDOW = 0.07;
export const MAX_RESULTS = 6;
export const MAX_RELATED = 3;
/**
 * Related notes appear unasked, so they must be clearly related. Raw scores between two notes run
 * high for this model (0.66–0.80 on the demo notes, related or not), so similarity is measured
 * after subtracting the library's average note vector. On the demo notes, real pairs (a run and
 * physio advice, groceries and a birthday dinner) then score 0.21–0.39 and the rest 0.12 or less.
 */
export const MIN_RELATED_SCORE = 0.2;
/** Below this many indexed notes the average is not a fair baseline, so nothing is suggested. */
export const MIN_NOTES_FOR_RELATED = 8;
