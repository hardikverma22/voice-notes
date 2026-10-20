import { useEffect, useState } from 'react';
import { formatBytes } from '../lib/format';
import { estimateUsage } from '../storage/audio';

/** "Using 12.3 MB of 4.1 GB". Renders nothing where the Storage API is unavailable. */
export function StorageUsage() {
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void estimateUsage()
      .then((value) => {
        if (!cancelled) setEstimate(value);
      })
      .catch(() => {
        // Storage estimate is informational only.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!estimate) return null;
  return (
    <p className="text-xs text-fg-muted">
      Using {formatBytes(estimate.usage)} of {formatBytes(estimate.quota)}
    </p>
  );
}
