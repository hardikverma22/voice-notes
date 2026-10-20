import { useEffect, useState } from 'react';

export type Route = { name: 'home' } | { name: 'note'; id: string };

export function parseRoute(hash: string): Route {
  const match = /^#\/note\/(.+)$/.exec(hash);
  return match?.[1] ? { name: 'note', id: decodeURIComponent(match[1]) } : { name: 'home' };
}

/** Sets the hash route, for example navigate('/note/abc') or navigate('/'). */
export function navigate(path: string): void {
  window.location.hash = path;
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
