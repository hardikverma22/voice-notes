import { m } from 'motion/react';
import { IconButton } from '../../design/components/Button';
import { ProgressBar } from '../../design/components/ProgressBar';
import { Select } from '../../design/components/Select';
import {
  CloudArrowDownIcon,
  PauseIcon,
  PlayIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SpeakerHighIcon,
  WarningCircleIcon,
  XIcon,
} from '../../design/icons';
import { formatBytes } from '../../lib/format';
import { SPEEDS, TTS_MODEL_BYTES, VOICES, type Speed, type Voice } from './config';
import {
  changeVoice,
  pauseReading,
  resumeReading,
  skipSentences,
  stopReading,
  type ReadAloudState,
} from './readAloud';
import { useSpeechSettings } from './settings';

const SPEED_OPTIONS = SPEEDS.map((speed) => ({ value: String(speed), label: `${speed}×` }));

/** The read-aloud player shown on a note while it is being read. */
export function ReadAloudPanel({ state, english }: { state: ReadAloudState; english: boolean }) {
  const settings = useSpeechSettings();

  if (state.status === 'error') {
    return (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-start gap-3 rounded-md border border-border bg-surface p-4 text-sm shadow-sm"
      >
        <WarningCircleIcon
          aria-hidden="true"
          weight="fill"
          className="mt-0.5 size-5 shrink-0 text-danger"
        />
        <p className="flex-1" role="alert">
          {state.error}
        </p>
        <IconButton icon={XIcon} label="Close" size="sm" onClick={stopReading} />
      </m.div>
    );
  }

  const loading = state.status === 'loading';
  const paused = state.status === 'paused';
  const percent = Math.round((state.download ?? 0) * 100);

  return (
    <m.section
      aria-label="Read aloud"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4 shadow-sm"
    >
      {loading ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <CloudArrowDownIcon aria-hidden="true" className="size-4.5 text-accent" />
              {state.download === null ? 'Loading the voice' : 'Downloading the voice'}
            </span>
            {state.download !== null ? (
              <span className="tabular text-fg-muted">{percent}%</span>
            ) : null}
          </div>
          <ProgressBar value={percent} label="Voice model download" />
          <p className="tabular text-xs text-fg-muted">
            About {formatBytes(TTS_MODEL_BYTES)} · One time only. Runs on this device and works
            offline afterwards.
          </p>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <SpeakerHighIcon
            aria-hidden="true"
            weight="fill"
            className={`mt-0.5 size-5 shrink-0 text-accent ${paused ? 'opacity-50' : ''}`}
          />
          <div className="min-w-0 flex-1">
            {/* No live region: announcing every sentence would talk over the voice. */}
            <p className="tabular text-xs font-medium text-fg-muted">
              {paused ? 'Paused · ' : state.waiting ? 'Preparing · ' : ''}
              Sentence {state.index + 1} of {state.count}
            </p>
            <p className="mt-1 font-serif text-base leading-snug" data-testid="read-aloud-sentence">
              {state.sentence}
            </p>
          </div>
        </div>
      )}

      {!english ? (
        <p className="text-xs text-fg-muted">
          The voice speaks English. Text in other languages may be skipped or read oddly.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5">
          <IconButton
            icon={SkipBackIcon}
            label="Previous sentence"
            size="sm"
            disabled={loading || state.index === 0}
            onClick={() => skipSentences(-1)}
          />
          <IconButton
            icon={paused ? PlayIcon : PauseIcon}
            label={paused ? 'Resume reading' : 'Pause reading'}
            active
            disabled={loading}
            onClick={paused ? resumeReading : pauseReading}
          />
          <IconButton
            icon={SkipForwardIcon}
            label="Next sentence"
            size="sm"
            disabled={loading || state.index >= state.count - 1}
            onClick={() => skipSentences(1)}
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Select fills its parent, so the wrappers set the widths. */}
          <div className="w-34">
            <Select
              aria-label="Voice"
              value={settings.voice}
              options={VOICES}
              onChange={(voice) => changeVoice({ voice: voice as Voice })}
            />
          </div>
          <div className="w-24">
            <Select
              aria-label="Reading speed"
              value={String(settings.speed)}
              options={SPEED_OPTIONS}
              onChange={(speed) => changeVoice({ speed: Number(speed) as Speed })}
            />
          </div>
          <IconButton icon={XIcon} label="Stop reading" size="sm" onClick={stopReading} />
        </div>
      </div>
    </m.section>
  );
}
