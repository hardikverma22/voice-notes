import { createContext, useContext } from 'react';
import type { LiveState } from '../transcribe/merge';
import type { RecorderErrorCode } from './recorder';
import type { RecorderState } from './useRecorder';

export interface RecordingContextValue {
  state: RecorderState;
  elapsedMs: number;
  analyser: AnalyserNode | null;
  errorCode: RecorderErrorCode | null;
  live: LiveState;
  /** The note saved by the last recording in this visit, for the confirmation card. */
  lastSavedId: string | null;
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  discard(): void;
  /** Start when idle, stop when recording or paused. */
  toggle(): void;
  dismissSaved(): void;
}

export const RecordingContext = createContext<RecordingContextValue | null>(null);

export function useRecording(): RecordingContextValue {
  const value = useContext(RecordingContext);
  if (!value) throw new Error('useRecording must be used inside RecordingProvider');
  return value;
}
