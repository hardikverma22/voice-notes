import { createContext, useContext } from 'react';
import type { Frame } from '../../storage/db';
import type { ScreenStatus } from '../screen/useScreenSession';
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
  /** The note this recording will be added to, or null for a new note. */
  targetNoteId: string | null;
  /** Moments marked during this recording; they become bookmarks. */
  markCount: number;
  /** The screen shared alongside this recording, if any. */
  screen: {
    status: ScreenStatus;
    /** The shared screen while sharing, for a live preview. */
    stream: MediaStream | null;
    frameCount: number;
    /** Date.now() of the newest frame, for a brief flash in the UI. */
    lastFrameAt: number | null;
    supported: boolean;
  };
  start(): void;
  /** Records more audio onto the end of an existing note. */
  startFor(noteId: string): void;
  /** Marks the current moment of the recording. */
  mark(): void;
  stop(): void;
  /** Picks a screen to share, then starts recording. Must run from a click. */
  startWithScreen(): void;
  /** Shares a screen during the running recording. Must run from a click. */
  shareScreen(): void;
  stopScreen(): void;
  /** Takes a frame of the shared screen now. */
  snap(): void;
  /** Takes a frame and opens it to draw on while the recording keeps going. */
  drawNow(): void;
  endDraw(): void;
  /** The frame being drawn on during the recording, if any. */
  drawingFrame: Frame | null;
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
