export const NOTES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

export interface Key {
  /** 0 = C … 11 = B */
  tonic: number;
  mode: 'major' | 'minor';
}

export function keyName(k: Key): string {
  return `${NOTES[k.tonic]} ${k.mode}`;
}

/** Camelot wheel code, the notation DJs use for harmonic mixing (8B = C major, 8A = A minor). */
export function camelot(k: Key): string {
  const major = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
  return k.mode === 'major' ? `${major[k.tonic]}B` : `${major[(k.tonic + 3) % 12]}A`;
}

/** Parse names as music databases write them: "C#", "Db", "F# minor". */
export function parseKey(tonic: string, scale: string): Key | null {
  const names: Record<string, number> = { C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3, E: 4, F: 5, 'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10, B: 11 };
  const t = names[tonic.trim().toUpperCase()];
  if (t === undefined) return null;
  return { tonic: t, mode: /min/i.test(scale) ? 'minor' : 'major' };
}

// Krumhansl–Kessler key profiles: how strongly each scale degree is heard to belong to a key.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlation(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((s, v) => s + v, 0) / n;
  const mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

export interface KeyEstimate {
  key: Key;
  /** 0–1: how clearly this key beats the runner-up. */
  confidence: number;
}

/** Find the key whose profile best fits how much of each of the 12 pitch classes was heard. */
export function estimateKey(chroma: ArrayLike<number>): KeyEstimate | null {
  const c = Array.from(chroma);
  if (c.reduce((s, v) => s + v, 0) <= 0) return null;
  const scores: { key: Key; r: number }[] = [];
  for (let tonic = 0; tonic < 12; tonic++) {
    const rotated = c.map((_, i) => c[(i + tonic) % 12]);
    scores.push({ key: { tonic, mode: 'major' }, r: correlation(rotated, MAJOR) });
    scores.push({ key: { tonic, mode: 'minor' }, r: correlation(rotated, MINOR) });
  }
  scores.sort((a, b) => b.r - a.r);
  if (scores[0].r <= 0) return null;
  return { key: scores[0].key, confidence: Math.max(0, Math.min(1, (scores[0].r - scores[1].r) * 4 + (scores[0].r - 0.5))) };
}

export interface NoteReading {
  name: string;
  octave: number;
  /** How far from the exact note, in hundredths of a semitone (−50…+50). */
  cents: number;
  frequency: number;
}

export function noteFor(frequency: number): NoteReading {
  const midi = 69 + 12 * Math.log2(frequency / 440);
  const nearest = Math.round(midi);
  return { name: NOTES[((nearest % 12) + 12) % 12], octave: Math.floor(nearest / 12) - 1, cents: Math.round((midi - nearest) * 100), frequency };
}
