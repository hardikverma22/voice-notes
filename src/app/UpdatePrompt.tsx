import { AnimatePresence, m } from 'motion/react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../design/components/Button';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  const visible = needRefresh || offlineReady;
  return (
    <AnimatePresence>
      {visible ? (
        <m.div
          role="status"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
          className="fixed top-3 left-1/2 z-[55] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-surface py-1.5 pr-1.5 pl-4 shadow-lg"
        >
          <span className="flex-1 text-sm">
            {needRefresh ? 'A new version is ready' : 'Ready to work offline'}
          </span>
          {needRefresh ? (
            <Button size="sm" onClick={() => void updateServiceWorker(true)}>
              Reload
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setOfflineReady(false);
              setNeedRefresh(false);
            }}
          >
            {needRefresh ? 'Later' : 'OK'}
          </Button>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
