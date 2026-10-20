import { formatBytes } from '../../lib/format';
import { ProgressBar } from '../../design/components/ProgressBar';
import { Button } from '../../design/components/Button';
import type { Device } from './protocol';
import type { ModelProgress, TranscriberStatus } from './useTranscriber';

interface ModelStatusProps {
  status: TranscriberStatus;
  progress: ModelProgress;
  device: Device | null;
  approxDownloadMB: number;
  errorMessage: string | null;
  onDownload: () => void;
}

function deviceLabel(device: Device | null): string {
  return device === 'webgpu' ? 'GPU' : 'CPU (slower on this device)';
}

export function ModelStatus({
  status,
  progress,
  device,
  approxDownloadMB,
  errorMessage,
  onDownload,
}: ModelStatusProps) {
  // Only status changes are announced; progress ticks are not, to avoid chatter.
  return (
    <div aria-live="polite" className="flex flex-col gap-3 text-sm">
      {status === 'probing' ? <p className="text-fg-muted">Checking this device…</p> : null}

      {status === 'needs-download' ? (
        <div className="flex flex-col items-start gap-3">
          <p>
            Transcription runs on your device. It needs a one-time download of about{' '}
            {approxDownloadMB} MB.
          </p>
          <Button onClick={onDownload}>Download model</Button>
        </div>
      ) : null}

      {status === 'loading' ? (
        <div className="flex flex-col gap-2">
          <p className="text-fg-muted">Loading the speech model…</p>
          <ProgressBar value={progress.percent} label="Model download" />
          <p className="text-fg-muted">
            {formatBytes(progress.loaded)} of {formatBytes(progress.total)}
          </p>
        </div>
      ) : null}

      {status === 'ready' ? <p>Ready. Running on {deviceLabel(device)}.</p> : null}

      {status === 'error' ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-danger">
            The speech model could not load. {errorMessage}
          </p>
          <Button variant="secondary" onClick={onDownload}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
