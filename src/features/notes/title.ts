import { formatDate } from '../../lib/format';

const MAX_TITLE = 60;

/** First sentence of the transcript, trimmed to 60 characters on a word boundary. */
export function titleFromTranscript(text: string, createdAt: number): string {
  const firstSentence = text.trim().split(/[.!?]/)[0]?.trim() ?? '';
  if (!firstSentence) return `Note, ${formatDate(createdAt)}`;
  if (firstSentence.length <= MAX_TITLE) return firstSentence;
  const cut = firstSentence.slice(0, MAX_TITLE);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}
