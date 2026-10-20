import { describe, expect, it } from 'vitest';
import { extensionFor, pickMimeType } from '../../src/features/recorder/mime';

describe('pickMimeType', () => {
  it('returns the first supported type in preference order', () => {
    const supported = new Set(['audio/mp4', 'audio/ogg;codecs=opus']);
    expect(pickMimeType((t) => supported.has(t))).toBe('audio/mp4');
  });

  it('prefers webm/opus when supported', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
  });

  it('returns undefined when nothing is supported', () => {
    expect(pickMimeType(() => false)).toBeUndefined();
  });
});

describe('extensionFor', () => {
  it('maps mime types to file extensions', () => {
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionFor('audio/mp4')).toBe('m4a');
    expect(extensionFor('audio/ogg;codecs=opus')).toBe('ogg');
    expect(extensionFor('audio/unknown')).toBe('audio');
  });
});
