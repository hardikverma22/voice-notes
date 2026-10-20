import { useEffect, useState } from 'react';
import { formatDuration } from '../../lib/format';
import { useRecorder, type RecordingResult, type UseRecorderOptions } from './useRecorder';
import { useSpaceToggle } from './useSpaceToggle';
import { RecordButton } from './RecordButton';
import { Waveform } from './Waveform';
import type { RecorderErrorCode } from './recorder';

const ERROR_TEXT: Record<RecorderErrorCode, string> = {
  'permission-denied':
    "Microphone access is blocked. Allow it in your browser's site settings, then try again.",
  'no-microphone': 'No microphone found.',
  'mic-busy': 'Your microphone is in use by another app.',
  'insecure-context': 'Recording needs a secure connection (https or localhost).',
  unknown: 'Something went wrong while starting the microphone.',
};

interface RecorderPanelProps {
  onStarted?: UseRecorderOptions['onStarted'];
  onChunk?: UseRecorderOptions['onChunk'];
  /** True while the previous recording is still being saved. */
  busy?: boolean;
  /** False until the speech model is ready. Recording is blocked until then. */
  ready: boolean;
  disabledReason?: string;
  onFinished?: (result: RecordingResult) => void;
}

export function RecorderPanel({
  ready,
  disabledReason,
  onFinished,
  onStarted,
  onChunk,
  busy = false,
}: RecorderPanelProps) {
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const recorder = useRecorder({
    onStarted,
    onChunk,
    onFinished: (result) => {
      const blob = new Blob(result.chunks, { type: result.mimeType || 'audio/webm' });
      setClipUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return URL.createObjectURL(blob);
      });
      onFinished?.(result);
    },
  });

  const recording = recorder.state === 'recording' || recorder.state === 'stopping';

  function toggle() {
    if (recorder.state === 'recording') {
      void recorder.stop();
    } else if (ready && !busy && (recorder.state === 'idle' || recorder.state === 'error')) {
      void recorder.start();
    }
  }

  useSpaceToggle(toggle, ready || recording);

  useEffect(() => {
    return () => {
      setClipUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    };
  }, []);

  const caption =
    recorder.state === 'requesting'
      ? 'Starting…'
      : recorder.state === 'stopping'
        ? 'Saving…'
        : recorder.state === 'idle' && recorder.elapsedMs === 0
          ? 'Tap to record'
          : formatDuration(recorder.elapsedMs);

  return (
    <section aria-labelledby="recorder-heading" className="flex flex-col items-center gap-6">
      <h2 id="recorder-heading" className="sr-only">
        Recorder
      </h2>
      <RecordButton
        recording={recording}
        onToggle={toggle}
        disabled={
          !ready || busy || recorder.state === 'requesting' || recorder.state === 'stopping'
        }
        disabledReason={!ready ? disabledReason : undefined}
        caption={caption}
      />
      <div className="w-full">
        <Waveform analyser={recorder.analyser} />
      </div>
      {recorder.error ? (
        <p role="alert" className="text-center text-sm text-danger">
          {ERROR_TEXT[recorder.error.code]}
        </p>
      ) : null}
      {clipUrl && !recording ? (
        <audio controls src={clipUrl} className="w-full" aria-label="Last recording" />
      ) : null}
    </section>
  );
}
