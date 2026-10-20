import { AnimatePresence, m } from 'motion/react';
import { ProgressBar } from '../../design/components/ProgressBar';
import {
  CheckCircleIcon,
  CloudArrowDownIcon,
  CpuIcon,
  LightningIcon,
  WarningCircleIcon,
} from '../../design/icons';
import { formatBytes } from '../../lib/format';
import { loadModel, useModel, type ModelState } from './modelStore';

function deviceLabel(device: ModelState['device']): string {
  return device === 'webgpu' ? 'GPU' : 'CPU';
}

/** Compact header chip. Click opens settings (passed in). */
export function ModelChip({ onClick }: { onClick: () => void }) {
  const model = useModel();
  if (model.status === 'probing') return null;

  let icon = <CloudArrowDownIcon aria-hidden="true" className="size-4" />;
  let text = 'Model not downloaded';
  let short = 'Model';
  let tone = 'text-fg-muted';
  if (model.status === 'loading') {
    icon = <ProgressRing percent={model.percent} />;
    text = model.cached ? 'Loading model' : `Downloading ${Math.round(model.percent)}%`;
    short = `${Math.round(model.percent)}%`;
    tone = 'text-fg';
  } else if (model.status === 'ready') {
    const DeviceIcon = model.device === 'webgpu' ? LightningIcon : CpuIcon;
    icon = <DeviceIcon aria-hidden="true" weight="fill" className="size-4 text-accent" />;
    text = `On-device · ${deviceLabel(model.device)}`;
    short = deviceLabel(model.device);
  } else if (model.status === 'error') {
    icon = <WarningCircleIcon aria-hidden="true" weight="fill" className="size-4 text-danger" />;
    text = 'Model failed';
    short = 'Error';
    tone = 'text-danger';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Speech model: ${text}. Open settings`}
      className={`inline-flex min-h-9 items-center gap-2 rounded-full border border-border bg-surface px-3 text-xs font-medium shadow-sm transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-focus ${tone}`}
    >
      {icon}
      <span className="tabular whitespace-nowrap">
        <span className="sm:hidden">{short}</span>
        <span className="hidden sm:inline">{text}</span>
      </span>
    </button>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 -rotate-90">
      <circle cx="8" cy="8" r={r} fill="none" stroke="var(--vn-surface-2)" strokeWidth="2.5" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="var(--vn-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(100, percent) / 100)}
        style={{ transition: 'stroke-dashoffset 200ms linear' }}
      />
    </svg>
  );
}

/** Inline download card shown while the model is fetched (first recording, or from settings). */
export function ModelProgressCard({ context }: { context: 'recording' | 'settings' }) {
  const model = useModel();
  const visible = model.status === 'loading' || model.status === 'error';
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <m.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
          className="w-full overflow-hidden"
        >
          <div className="rounded-md border border-border bg-surface p-4 text-left shadow-sm">
            {model.status === 'error' ? (
              <div className="flex items-start gap-3">
                <WarningCircleIcon
                  aria-hidden="true"
                  weight="fill"
                  className="mt-0.5 size-5 shrink-0 text-danger"
                />
                <div className="flex-1 text-sm">
                  <p className="font-medium text-danger" role="alert">
                    The speech model could not load.
                  </p>
                  <p className="mt-1 text-fg-muted">
                    {model.errorMessage ?? 'Check your connection.'} Your recordings are saved and
                    will be transcribed once it loads.
                  </p>
                  <button
                    type="button"
                    onClick={loadModel}
                    className="mt-2 font-medium text-accent underline underline-offset-4"
                  >
                    Try again
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex items-center gap-2 font-medium">
                    <CloudArrowDownIcon aria-hidden="true" className="size-4.5 text-accent" />
                    {model.cached ? 'Loading speech model' : 'Downloading speech model'}
                  </span>
                  <span className="tabular text-fg-muted">{Math.round(model.percent)}%</span>
                </div>
                <ProgressBar value={model.percent} label="Speech model download" />
                <p className="tabular text-xs text-fg-muted">
                  {model.total > 0
                    ? `${formatBytes(model.loaded)} of ${formatBytes(model.total)}`
                    : `About ${model.approxDownloadMB} MB`}
                  {context === 'recording'
                    ? ' · One-time download. You are already recording; live text starts when this finishes.'
                    : ' · One time only. Works offline afterwards.'}
                </p>
              </div>
            )}
          </div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}

export function ModelReadyLine() {
  const model = useModel();
  if (model.status !== 'ready') return null;
  return (
    <p className="flex items-center gap-2 text-sm text-success">
      <CheckCircleIcon aria-hidden="true" weight="fill" className="size-4.5" />
      Ready. Running on this device&apos;s {deviceLabel(model.device)}.
    </p>
  );
}
