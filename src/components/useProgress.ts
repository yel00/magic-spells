import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { currentProgress, player } from '../state/player';

/** Live playback position, ticking between server polls while music is playing. */
export function useProgress(): number {
  const state = useStore(player);
  const [, tick] = useState(0);
  const playing = !!state.playback?.is_playing;
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [playing]);
  return currentProgress(state);
}
