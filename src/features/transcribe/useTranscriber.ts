import { useCallback, useEffect, useState } from 'react';
import { getWhisperClient, type TranscribeResult } from './whisperClient';
import type { Device, FromWorker, TranscribeKind } from './protocol';

export type TranscriberStatus = 'probing' | 'needs-download' | 'loading' | 'ready' | 'error';

export interface ModelProgress {
  loaded: number;
  total: number;
  percent: number;
}

export function useTranscriber() {
  const [status, setStatus] = useState<TranscriberStatus>('probing');
  const [progress, setProgress] = useState<ModelProgress>({ loaded: 0, total: 0, percent: 0 });
  const [device, setDevice] = useState<Device | null>(null);
  const [approxDownloadMB, setApproxDownloadMB] = useState(80);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const client = getWhisperClient();
    const unsubscribe = client.subscribe((message: FromWorker) => {
      switch (message.type) {
        case 'probe-result':
          setDevice(message.device);
          setApproxDownloadMB(message.approxDownloadMB);
          if (message.cached) {
            setStatus('loading');
            client.load();
          } else {
            setStatus('needs-download');
          }
          break;
        case 'progress':
          setProgress({ loaded: message.loaded, total: message.total, percent: message.progress });
          break;
        case 'ready':
          setDevice(message.device);
          setErrorMessage(null);
          setStatus('ready');
          break;
        case 'error':
          if (message.stage === 'probe' || message.stage === 'load') {
            setErrorMessage(message.message);
            setStatus('error');
          }
          break;
      }
    });
    client.probe();
    return unsubscribe;
  }, []);

  const download = useCallback(() => {
    setErrorMessage(null);
    setStatus('loading');
    getWhisperClient().load();
  }, []);

  const transcribe = useCallback(
    (kind: TranscribeKind, audio: Float32Array): Promise<TranscribeResult> =>
      getWhisperClient().transcribe(kind, audio),
    [],
  );

  return { status, progress, device, approxDownloadMB, errorMessage, download, transcribe };
}
