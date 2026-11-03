import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * The current time for a screen, kept out of render (React requires render to
 * be pure). It refreshes when the screen comes into focus, when the app returns
 * to the foreground and once a minute, which is all that due reviews, the
 * weekly goal and free-run counts need.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
    }, []),
  );
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [intervalMs]);
  return now;
}
