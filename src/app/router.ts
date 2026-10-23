import { useEffect, useState } from 'react';

/** t: seconds into the recording to play from, set by search results. */
export type Route = { name: 'home' } | { name: 'note'; id: string; t: number | null };

export function parseRoute(hash: string): Route {
  const match = /^#\/note\/([^?]+)(?:\?t=(\d+(?:\.\d+)?))?$/.exec(hash);
  if (!match?.[1]) return { name: 'home' };
  return { name: 'note', id: decodeURIComponent(match[1]), t: match[2] ? Number(match[2]) : null };
}

export function noteHref(id: string, t?: number | null): string {
  return `#/note/${encodeURIComponent(id)}${t != null ? `?t=${Math.max(0, t).toFixed(1)}` : ''}`;
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
