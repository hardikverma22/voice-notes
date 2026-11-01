import { useEffect, useMemo } from 'react';
import type { Frame } from '../../storage/db';

/** Object URLs for frame images, keyed by frame id. Revoked when the set of frames changes. */
export function useFrameUrls(frames: Frame[] | undefined): Map<string, string> {
  // Frames are re-read when a drawing changes; the images only change when the ids do.
  const key = frames?.map((frame) => frame.id).join(',') ?? '';
  const urls = useMemo(() => {
    const next = new Map<string, string>();
    for (const frame of frames ?? []) next.set(frame.id, URL.createObjectURL(frame.blob));
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(
    () => () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
    [urls],
  );
  return urls;
}
