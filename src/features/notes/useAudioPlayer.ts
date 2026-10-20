import { useCallback, useEffect, useRef, useState } from 'react';

export const RATES = [1, 1.25, 1.5, 2] as const;

export interface AudioPlayer {
  ready: boolean;
  playing: boolean;
  currentTime: number;
  duration: number;
  rate: number;
  toggle(): void;
  play(): void;
  seek(seconds: number): void;
  skip(delta: number): void;
  cycleRate(): void;
}

/**
 * Plays one object URL. MediaRecorder WebM files often report an infinite duration, so the
 * note's stored duration is the fallback.
 */
export function useAudioPlayer(url: string | null, fallbackDurationSec: number): AudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    if (!url) return;
    const audio = new Audio(url);
    audio.preload = 'metadata';
    audioRef.current = audio;
    let frame = 0;
    const loop = () => {
      setCurrentTime(audio.currentTime);
      frame = requestAnimationFrame(loop);
    };
    const onPlay = () => {
      setPlaying(true);
      frame = requestAnimationFrame(loop);
    };
    const onPause = () => {
      setPlaying(false);
      cancelAnimationFrame(frame);
      setCurrentTime(audio.currentTime);
    };
    const onMeta = () => {
      setReady(true);
      if (Number.isFinite(audio.duration)) setMediaDuration(audio.duration);
    };
    const onEnded = () => {
      onPause();
      setCurrentTime(0);
      audio.currentTime = 0;
    };
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('seeked', () => setCurrentTime(audio.currentTime));
    return () => {
      cancelAnimationFrame(frame);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
      setReady(false);
      setPlaying(false);
      setCurrentTime(0);
    };
  }, [url]);

  const duration = mediaDuration || fallbackDurationSec;

  const play = useCallback(() => void audioRef.current?.play().catch(() => undefined), []);
  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => undefined);
    else audio.pause();
  }, []);
  const seek = useCallback(
    (seconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const next = Math.max(0, Math.min(duration || seconds, seconds));
      audio.currentTime = next;
      setCurrentTime(next);
    },
    [duration],
  );
  const skip = useCallback(
    (delta: number) => seek((audioRef.current?.currentTime ?? 0) + delta),
    [seek],
  );
  const cycleRate = useCallback(() => {
    setRate((current) => {
      const next =
        RATES[(RATES.indexOf(current as (typeof RATES)[number]) + 1) % RATES.length] ?? 1;
      if (audioRef.current) audioRef.current.playbackRate = next;
      return next;
    });
  }, []);

  return { ready, playing, currentTime, duration, rate, toggle, play, seek, skip, cycleRate };
}
