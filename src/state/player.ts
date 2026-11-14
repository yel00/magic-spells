import { createStore } from '../lib/store';
import * as api from '../spotify/api';
import { ApiError } from '../spotify/api';
import { SignedOutError } from '../spotify/auth';
import type { PlaybackState } from '../spotify/types';
import { toast, ui } from './ui';

interface PlayerState {
  playback: PlaybackState | null;
  /** When `playback` was read, so the progress bar can run between polls. */
  at: number;
  loaded: boolean;
}

export const player = createStore<PlayerState>({ playback: null, at: 0, loaded: false });

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
// Bumped on every command so a poll that started before it can't overwrite the newer state.
let epoch = 0;

export async function refresh() {
  const started = epoch;
  try {
    const playback = await api.getPlayback();
    if (started !== epoch) return;
    player.set({ playback: playback && playback.device ? playback : null, at: Date.now(), loaded: true });
  } catch (e) {
    if (e instanceof SignedOutError) stopPolling();
    else player.set({ loaded: true });
  }
}

function schedule() {
  clearTimeout(timer);
  if (!running || document.hidden) return;
  const playing = player.get().playback?.is_playing;
  timer = setTimeout(async () => {
    await refresh();
    schedule();
  }, playing ? 3000 : 8000);
}

function onVisibility() {
  if (!document.hidden) refresh().then(schedule);
  else clearTimeout(timer);
}

export function startPolling() {
  if (running) return;
  running = true;
  document.addEventListener('visibilitychange', onVisibility);
  refresh().then(schedule);
}

export function stopPolling() {
  running = false;
  clearTimeout(timer);
  document.removeEventListener('visibilitychange', onVisibility);
}

export function currentProgress(s: PlayerState = player.get()): number {
  const p = s.playback;
  if (!p) return 0;
  const base = p.progress_ms || 0;
  const live = p.is_playing ? base + (Date.now() - s.at) : base;
  return Math.min(live, p.item?.duration_ms ?? live);
}

function patch(change: Partial<PlaybackState>) {
  const p = player.get().playback;
  if (p) player.set({ playback: { ...p, progress_ms: currentProgress(), ...change }, at: Date.now() });
}

function settle(delay = 450) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    await refresh();
    schedule();
  }, delay);
}

/**
 * Run a player command. If Spotify says there is nothing to play on, open the
 * device picker and finish the command on whichever device the user picks.
 */
async function run(action: () => Promise<unknown>, onDevice?: (deviceId: string) => Promise<unknown>) {
  epoch++;
  try {
    if (!player.get().playback && onDevice) {
      const devices = await api.getDevices();
      const active = devices.find((d) => d.is_active && d.id);
      if (!active) {
        ui.set({ sheet: 'devices', pending: onDevice });
        return;
      }
    }
    await action();
    settle();
  } catch (e) {
    if (e instanceof ApiError && e.status === 404 && onDevice) {
      ui.set({ sheet: 'devices', pending: onDevice });
    } else if (e instanceof ApiError && e.status === 403) {
      toast(e.reason === 'PREMIUM_REQUIRED' ? 'Spotify Premium is needed to control playback.' : "Spotify wouldn't allow that right now.");
      settle(0);
    } else {
      toast(e instanceof Error ? e.message : 'Something went wrong.');
      settle(0);
    }
  }
}

export const commands = {
  toggle() {
    const p = player.get().playback;
    if (p?.is_playing) {
      patch({ is_playing: false });
      return run(() => api.pause());
    }
    patch({ is_playing: true });
    return run(() => api.play(), (deviceId) => api.transfer(deviceId, true));
  },
  next() {
    return run(() => api.next());
  },
  previous() {
    return run(() => api.previous());
  },
  seek(ms: number) {
    patch({ progress_ms: ms });
    return run(() => api.seek(ms));
  },
  shuffle() {
    const on = !player.get().playback?.shuffle_state;
    patch({ shuffle_state: on });
    return run(() => api.setShuffle(on));
  },
  repeat() {
    const cur = player.get().playback?.repeat_state || 'off';
    const mode = cur === 'off' ? 'context' : cur === 'context' ? 'track' : 'off';
    patch({ repeat_state: mode });
    return run(() => api.setRepeat(mode));
  },
  playContext(contextUri: string, offsetUri?: string) {
    const opts = { contextUri, offsetUri };
    return run(() => api.play(opts), (deviceId) => api.play({ ...opts, deviceId }));
  },
  playTracks(uris: string[], index = 0) {
    // Spotify accepts a limited number of URIs per call; start from a window around the pick.
    const start = Math.max(0, Math.min(index, uris.length - 1));
    const slice = uris.slice(start, start + 100);
    const opts = { uris: slice, offsetPosition: 0 };
    return run(() => api.play(opts), (deviceId) => api.play({ ...opts, deviceId }));
  },
  async shuffleContext(contextUri: string) {
    await run(() => api.setShuffle(true)).catch(() => undefined);
    return commands.playContext(contextUri);
  },
  async queue(uri: string, name: string) {
    await run(
      async () => {
        await api.addToQueue(uri);
        toast(`Added “${name}” to the queue`);
      },
      async (deviceId) => {
        await api.transfer(deviceId, false);
        await api.addToQueue(uri);
        toast(`Added “${name}” to the queue`);
      },
    );
  },
  async transfer(deviceId: string) {
    epoch++;
    const pending = ui.get().pending;
    ui.set({ pending: null });
    try {
      if (pending) await pending(deviceId);
      else await api.transfer(deviceId, player.get().playback?.is_playing ?? true);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't reach that device.");
    }
    settle(700);
  },
};

let volumeTimer: ReturnType<typeof setTimeout> | undefined;

/** Volume follows the finger locally and sends at most a few updates a second. */
export function setVolume(pct: number) {
  const p = player.get().playback;
  if (!p) return;
  epoch++;
  player.set({ playback: { ...p, progress_ms: currentProgress(), device: { ...p.device, volume_percent: pct } }, at: Date.now() });
  clearTimeout(volumeTimer);
  volumeTimer = setTimeout(() => {
    api.setVolume(pct).catch(() => toast("This device doesn't allow volume control.")).finally(() => settle(800));
  }, 180);
}
