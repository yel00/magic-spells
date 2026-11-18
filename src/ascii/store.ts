// How the listener likes their ASCII cover. Remembered on the device.
import { createStore } from '../lib/store';
import { DEFAULTS, type AsciiSettings } from './engine';

const KEY = 'ms.ascii';

function load(): AsciiSettings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<AsciiSettings>) };
  } catch {
    return DEFAULTS;
  }
}

export const ascii = createStore<AsciiSettings>(load());

export function setAscii(change: Partial<AsciiSettings>) {
  ascii.set(change);
  try {
    localStorage.setItem(KEY, JSON.stringify(ascii.get()));
  } catch {
    /* storage unavailable: the choice lasts for this session */
  }
}
