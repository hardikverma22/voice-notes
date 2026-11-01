import { lazy, Suspense } from 'react';
import { useRecording } from '../recorder/recordingContext';

const LiveDrawPanel = lazy(() => import('./LiveDrawPanel'));

/** Drawing on a frame during a recording. The drawing code loads when it is first opened. */
export function LiveDraw() {
  const rec = useRecording();
  if (!rec.drawingFrame) return null;
  return (
    <Suspense fallback={null}>
      <LiveDrawPanel key={rec.drawingFrame.id} frame={rec.drawingFrame} onDone={rec.endDraw} />
    </Suspense>
  );
}
