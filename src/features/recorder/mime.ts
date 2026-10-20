const CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/ogg;codecs=opus',
] as const;

function nativeIsTypeSupported(type: string): boolean {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);
}

/** First supported MIME type in preference order, or undefined to let the browser choose. */
export function pickMimeType(
  isSupported: (type: string) => boolean = nativeIsTypeSupported,
): string | undefined {
  for (const candidate of CANDIDATES) {
    if (isSupported(candidate)) return candidate;
  }
  return undefined;
}

export type AudioExtension = 'webm' | 'm4a' | 'ogg' | 'audio';

export function extensionFor(mime: string): AudioExtension {
  if (mime.startsWith('audio/webm')) return 'webm';
  if (mime.startsWith('audio/mp4')) return 'm4a';
  if (mime.startsWith('audio/ogg')) return 'ogg';
  return 'audio';
}
