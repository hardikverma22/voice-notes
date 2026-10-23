import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

async function load() {
  return import('../../src/features/transcribe/settings');
}

describe('transcription settings', () => {
  it('defaults to English and Fast', async () => {
    const s = await load();
    expect(s.getTranscriptionSettings()).toEqual({ language: 'english', quality: 'fast' });
    expect(s.whisperLanguage()).toBe('english');
  });

  it('saves choices across reloads', async () => {
    const s = await load();
    s.setTranscriptionSettings({ language: 'hindi', quality: 'accurate' });
    expect(s.whisperLanguage()).toBe('hindi');
    const again = await (vi.resetModules(), load());
    expect(again.getTranscriptionSettings()).toEqual({ language: 'hindi', quality: 'accurate' });
  });

  it('drops the old "detect automatically" choice, which never detected anything', async () => {
    localStorage.setItem('vn-transcription', JSON.stringify({ language: 'auto' }));
    const s = await load();
    expect(s.getTranscriptionSettings().language).toBe('english');
  });

  it('ignores stored values it does not know', async () => {
    localStorage.setItem('vn-transcription', JSON.stringify({ language: 'klingon', quality: 'x' }));
    const s = await load();
    expect(s.getTranscriptionSettings()).toEqual({ language: 'english', quality: 'fast' });
  });
});
