import { describe, expect, it } from 'vitest';
import { forgetSpeechModel, getModelState } from '../../src/features/transcribe/modelStore';

describe('forgetSpeechModel', () => {
  it('resets a ready model to not downloaded, without waiting for a reload', () => {
    forgetSpeechModel();
    expect(getModelState()).toMatchObject({
      status: 'idle',
      cached: false,
      percent: 0,
      errorMessage: null,
    });
  });
});
