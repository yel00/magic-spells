import { createStore } from '../lib/store';
import type { Track } from '../spotify/types';

export type Sheet = 'none' | 'now' | 'queue' | 'devices';

interface UiState {
  sheet: Sheet;
  /** What to do once the user picks a device (set when a command found nothing to play on). */
  pending: ((deviceId: string) => Promise<unknown>) | null;
  actionsFor: Track | null;
  infoFor: Track | null;
  toast: string | null;
}

export const ui = createStore<UiState>({ sheet: 'none', pending: null, actionsFor: null, infoFor: null, toast: null });

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string) {
  clearTimeout(toastTimer);
  ui.set({ toast: message });
  toastTimer = setTimeout(() => ui.set({ toast: null }), 2600);
}

export function openSheet(sheet: Sheet) {
  ui.set({ sheet, ...(sheet !== 'devices' ? { pending: null } : {}) });
}
