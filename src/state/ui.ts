import { createStore } from '../lib/store';
import type { MixRequest } from '../components/Discover';
import type { Video } from '../discover';
import type { NoteSubject } from '../notes/types';
import type { Track } from '../spotify/types';
import type { TagSubject } from '../tags/logic';

export type Sheet = 'none' | 'now' | 'queue' | 'devices';

interface UiState {
  sheet: Sheet;
  /** What to do once the user picks a device (set when a command found nothing to play on). */
  pending: ((deviceId: string) => Promise<unknown>) | null;
  actionsFor: Track | null;
  infoFor: Track | null;
  noteDraft: { subject: NoteSubject; id?: string; body: string } | null;
  tagsFor: TagSubject | null;
  lyrics: boolean;
  mix: MixRequest | null;
  video: Video | null;
  toast: string | null;
}

export const ui = createStore<UiState>({ sheet: 'none', pending: null, actionsFor: null, infoFor: null, noteDraft: null, tagsFor: null, lyrics: false, mix: null, video: null, toast: null });

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string) {
  clearTimeout(toastTimer);
  ui.set({ toast: message });
  toastTimer = setTimeout(() => ui.set({ toast: null }), 2600);
}

export function openSheet(sheet: Sheet) {
  ui.set({ sheet, ...(sheet !== 'devices' ? { pending: null } : {}) });
}
