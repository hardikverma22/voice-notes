import { LazyMotion, MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

// Animation features load in their own chunk so the entry bundle stays small.
const loadFeatures = () => import('./motionFeatures').then((mod) => mod.default);

/** Shared spring for layout and enter animations. */
const spring = { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 } as const;

export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={spring}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
