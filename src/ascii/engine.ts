// The album cover drawn in characters, moving to the song's tempo and wearing
// away as the song plays. Everything here is plain arithmetic on a grid of
// brightness values, so it can be tested without a screen.

export const RAMP = ' .:-=+*x#%@';

export type Decay = 'off' | 'dissolve' | 'erode' | 'edges';
export type Look = 'colour' | 'green' | 'amber' | 'white';

export interface AsciiSettings {
  on: boolean;
  glitch: boolean;
  blocks: boolean;
  shimmer: boolean;
  decay: Decay;
  look: Look;
}

export const DEFAULTS: AsciiSettings = { on: false, glitch: true, blocks: false, shimmer: true, decay: 'dissolve', look: 'colour' };

export const LOOK_RGB: Record<Look, [number, number, number] | null> = {
  colour: null,
  green: [70, 255, 120],
  amber: [255, 184, 64],
  white: [240, 238, 232],
};

/** One brightness (0 to 1) and one colour per character. */
export interface Grid {
  n: number;
  lum: Float32Array;
  rgb: Uint8ClampedArray;
}

/** A repeatable stand-in for randomness: the same inputs always give the same number between 0 and 1. */
export function hash(x: number, y: number, t: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + t * 74.7) * 43758.5453;
  return v - Math.floor(v);
}

/** Turn n×n pixels (RGBA) into a grid. */
export function gridFrom(pixels: ArrayLike<number>, n: number): Grid {
  const lum = new Float32Array(n * n);
  const rgb = new Uint8ClampedArray(n * n * 3);
  for (let i = 0; i < n * n; i++) {
    const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
    lum[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
  }
  return { n, lum, rgb };
}

/** Never disappears. */
const NEVER = 2;

/**
 * For each character, how far through the song (0 to 1) it disappears.
 * Characters that are blank anyway are left out, so the visible ones are
 * spread evenly across the whole song.
 */
export function planDecay(grid: Grid, mode: Decay): Float32Array {
  const { n, lum } = grid;
  const dieAt = new Float32Array(n * n).fill(NEVER);
  if (mode === 'off') return dieAt;
  const half = (n - 1) / 2, maxR = Math.hypot(half, half) || 1;
  const score = new Float32Array(n * n);
  const seen: number[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x, noise = hash(x, y, 5.5);
      // Lowest score goes first: the darkest (erode), the outermost (edges), or pot luck (dissolve).
      score[i] = mode === 'erode' ? 0.8 * lum[i] + 0.2 * noise : mode === 'edges' ? 0.8 * (1 - Math.hypot(x - half, y - half) / maxR) + 0.2 * noise : noise;
      if (lum[i] > 0.04) seen.push(i);
    }
  }
  seen.sort((a, b) => score[a] - score[b]);
  seen.forEach((i, rank) => {
    dieAt[i] = 0.01 + 0.98 * (rank / Math.max(1, seen.length - 1));
  });
  return dieAt;
}

export interface Scene {
  beats: number;
  beatNo: number;
  phase: number;
  /** How hard the current beat is hitting, 0 to about 1.4. */
  kick: number;
  /** The last beat of every fourth bar: everything doubles up. */
  fill: boolean;
  /** How far strips and flickers travel; faster songs move more. */
  amp: number;
  /** Height of a glitch strip, in characters. */
  band: number;
  /** The step counter the glitch and blocks change on. */
  tick: number;
  /** A flash of the negative on the first beat of a phrase. */
  flash: boolean;
}

/**
 * What the picture is doing at a point in the song. Worked out from the beat
 * count alone, so it looks random but the same moment always looks the same,
 * and skipping around the song never drifts out of time.
 */
export function sceneAt(beats: number, bpm: number): Scene {
  const beatNo = Math.floor(beats), bar = Math.floor(beatNo / 4), phase = beats - beatNo;
  const tempo = Math.min(1.5, Math.max(0.6, bpm / 120));
  const fill = bar % 4 === 3 && beatNo % 4 === 3;
  // Fast songs get short, sharp hits; slow songs get long swells.
  const decay = 3.2 + 2.6 * tempo;
  const accent = 0.55 + 0.75 * hash(beatNo, 2, 5.3);
  let kick = Math.exp(-decay * phase) * accent * (beatNo % 4 === 0 ? 1.2 : 1);
  // A quieter extra hit halfway between some beats.
  if (phase >= 0.5 && hash(beatNo, 9, 1.9) > 0.55) kick += Math.exp(-decay * (phase - 0.5)) * 0.55;
  if (fill) kick = Math.max(kick, Math.exp(-3.5 * ((beats * 4) % 1)));
  return {
    beats, beatNo, phase, fill,
    kick: Math.min(1.4, kick),
    amp: 1.15 * (0.75 + 0.35 * tempo),
    band: 2 + Math.floor(hash(bar, 2, 9.9) * 4),
    tick: Math.floor(beats * (fill ? 8 : 2)),
    flash: bar % 4 === 0 && beatNo % 4 === 0 && phase < 0.1,
  };
}

/** How much of the cover has gone, stepping once per beat of the song. */
export function goneAt(progress: number, songBeats: number): number {
  if (!(songBeats > 0)) return Math.min(1, Math.max(0, progress));
  return Math.floor(Math.min(1, Math.max(0, progress)) * songBeats) / songBeats;
}

export interface Cell {
  ch: string;
  /** Brightness after the effects, 0 to 1. */
  l: number;
  /** Which character of the cover this one is showing (effects can pull from a neighbour). */
  from: number;
}

/** What to draw at one position, or null for nothing. */
export function cellAt(grid: Grid, dieAt: Float32Array, s: AsciiSettings, sc: Scene, x: number, y: number, gone: number, fading: number): Cell | null {
  const { n, lum } = grid;
  // Decay belongs to the character's own place on the cover, not to where an effect pulled it from.
  const life = s.decay === 'off' ? 1 : dieAt[y * n + x] - gone;
  if (life <= 0) return null;

  let sx = x, gain = 0.86 + 0.14 * sc.kick, jitter = 0;
  const moving = s.glitch || s.blocks || s.shimmer;
  if (s.glitch) {
    const strip = Math.floor(y / sc.band);
    if (hash(strip, 11, sc.tick) > 0.55) {
      sx += (hash(strip, 12, sc.tick) - 0.5) * 16 * sc.kick * sc.amp;
      gain += 0.2 * sc.kick;
    }
  }
  if (s.blocks) {
    const tile = Math.max(2, Math.round(n / 6));
    const v = hash(Math.floor(x / tile) + Math.floor(y / tile) * 13, 14, sc.tick);
    if (v > 0.72) gain += 0.75 * (0.4 + 0.6 * sc.kick);
    else if (v < 0.22) gain -= 0.27 * sc.amp;
  }
  if (s.shimmer) {
    jitter = (hash(x, y, Math.floor(sc.beats * 8)) - 0.5) * 1.4 * sc.kick * sc.amp;
    if (hash(x, y, sc.beatNo) > 0.985) gain += sc.kick;
  }
  if (!moving) gain = 1;

  sx = Math.min(n - 1, Math.max(0, Math.round(sx)));
  const from = y * n + sx;
  let l = Math.min(1, Math.max(0, lum[from] * gain + jitter * 0.25));
  // About to go: it thins out and flickers on the beat before it disappears.
  if (life < fading) l *= (life / fading) * (0.55 + 0.45 * Math.min(1, sc.kick + hash(x, y, sc.beatNo)));
  if (moving && sc.flash) l = 1 - l;
  // Lean towards the heavier characters so the picture reads as type, not dust.
  const ch = RAMP[Math.min(RAMP.length - 1, Math.round(Math.pow(Math.max(0, l + jitter * 0.12), 0.6) * (RAMP.length - 1)))] || ' ';
  return ch === ' ' ? null : { ch, l, from };
}

export interface FrameInput {
  grid: Grid;
  dieAt: Float32Array;
  settings: AsciiSettings;
  bpm: number;
  progressMs: number;
  durationMs: number;
}

/** Calls `put` for every character to draw in this frame. Returns how many there were. */
export function frame(input: FrameInput, put: (x: number, y: number, cell: Cell) => void): number {
  const { grid, dieAt, settings, bpm, progressMs, durationMs } = input;
  const beats = (progressMs / 60_000) * bpm;
  const songBeats = (durationMs / 60_000) * bpm;
  const sc = sceneAt(beats, bpm);
  const gone = settings.decay === 'off' ? -1 : goneAt(durationMs > 0 ? progressMs / durationMs : 0, songBeats);
  const fading = (songBeats > 0 ? 1.5 / songBeats : 0) + 0.012;
  let count = 0;
  for (let y = 0; y < grid.n; y++) {
    for (let x = 0; x < grid.n; x++) {
      const cell = cellAt(grid, dieAt, settings, sc, x, y, gone, fading);
      if (cell) {
        put(x, y, cell);
        count++;
      }
    }
  }
  return count;
}

/** The colour to draw a character in. */
export function inkFor(grid: Grid, look: Look, cell: Cell): string {
  const fixed = LOOK_RGB[look];
  if (fixed) return `rgba(${fixed[0]},${fixed[1]},${fixed[2]},${(0.45 + 0.55 * cell.l).toFixed(3)})`;
  // Keep the cover's hue but lift dark colours so the characters stay readable.
  const i = cell.from;
  const lift = Math.min(3, (0.35 + 0.65 * cell.l) / Math.max(0.08, grid.lum[i]));
  const c = (v: number) => Math.min(255, v * lift) | 0;
  return `rgb(${c(grid.rgb[i * 3])},${c(grid.rgb[i * 3 + 1])},${c(grid.rgb[i * 3 + 2])})`;
}
