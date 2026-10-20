import { useEffect, useState } from 'react';
import { estimateUsage } from '../storage/audio';

/** Storage estimate, refreshed when `refreshKey` changes. Null where unsupported. */
export function useStorageEstimate(refreshKey: unknown = 0) {
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void estimateUsage()
      .then((value) => {
        if (!cancelled) setEstimate(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return estimate;
}
