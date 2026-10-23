import { lazy, Suspense, useEffect } from 'react';
import { Layout } from './app/Layout';
import { UpdatePrompt } from './app/UpdatePrompt';
import { useHashRoute } from './app/router';
import { MotionProvider } from './design/motion';
import { ToastProvider } from './design/components/Toast';
import HomePage from './features/home/HomePage';
import { RecordingProvider } from './features/recorder/RecordingProvider';
import { initSearch } from './features/search/searchService';
import { initModel } from './features/transcribe/modelStore';

const NotePage = lazy(() => import('./features/notes/NotePage'));

export default function App() {
  useEffect(() => {
    initModel();
    initSearch();
  }, []);
  return (
    <MotionProvider>
      <ToastProvider>
        <RecordingProvider>
          <AppContent />
        </RecordingProvider>
      </ToastProvider>
    </MotionProvider>
  );
}

function AppContent() {
  const route = useHashRoute();
  return (
    <Layout route={route}>
      {route.name === 'note' ? (
        <Suspense fallback={null}>
          <NotePage key={route.id} id={route.id} t={route.t} />
        </Suspense>
      ) : (
        <HomePage />
      )}
      <UpdatePrompt />
    </Layout>
  );
}
