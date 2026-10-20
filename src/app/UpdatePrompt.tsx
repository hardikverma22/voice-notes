import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (needRefresh) {
    return (
      <div
        role="status"
        className="mt-6 flex items-center gap-3 rounded-md bg-surface p-3 shadow-sm"
      >
        <span className="flex-1 text-sm">A new version is ready</span>
        <button
          type="button"
          onClick={() => void updateServiceWorker(true)}
          className="min-h-11 rounded-md bg-accent px-3 text-sm text-accent-fg"
        >
          Reload
        </button>
      </div>
    );
  }

  if (offlineReady) {
    return (
      <div
        role="status"
        className="mt-6 flex items-center gap-3 rounded-md bg-surface p-3 shadow-sm"
      >
        <span className="flex-1 text-sm">Ready to work offline</span>
        <button
          type="button"
          onClick={() => setOfflineReady(false)}
          className="min-h-11 rounded-md border border-control px-3 text-sm"
        >
          Dismiss
        </button>
      </div>
    );
  }

  return null;
}
