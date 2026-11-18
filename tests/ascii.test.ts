import { describe, expect, it } from 'vitest';
import { cellAt, DEFAULTS, frame, goneAt, gridFrom, hash, inkFor, planDecay, sceneAt, type AsciiSettings, type Grid } from '../src/ascii/engine';

/** A cover that is black on the left, mid-grey in the middle and white on the right. */
function cover(n = 12): Grid {
  const px = new Uint8ClampedArray(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = x < n / 3 ? 0 : x < (2 * n) / 3 ? 128 : 255;
    px.set([v, v, v, 255], (y * n + x) * 4);
  }
  return gridFrom(px, n);
}
const still: AsciiSettings = { ...DEFAULTS, on: true, glitch: false, blocks: false, shimmer: false, decay: 'off' };
const count = (grid: Grid, settings: AsciiSettings, progressMs: number, durationMs = 240_000, bpm = 120) =>
  frame({ grid, dieAt: planDecay(grid, settings.decay), settings, bpm, progressMs, durationMs }, () => undefined);

describe('ascii cover: the picture', () => {
  it('reads brightness and colour from pixels', () => {
    const g = gridFrom([255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 255, 255], 2);
    expect(Array.from(g.lum).map((v) => Number(v.toFixed(2)))).toEqual([0.21, 1, 0, 0.07]);
    expect(Array.from(g.rgb.slice(0, 3))).toEqual([255, 0, 0]);
  });

  it('with everything off, draws the cover and holds it still', () => {
    const g = cover();
    const a: string[] = [], b: string[] = [];
    frame({ grid: g, dieAt: planDecay(g, 'off'), settings: still, bpm: 120, progressMs: 1000, durationMs: 240_000 }, (x, y, c) => a.push(`${x},${y},${c.ch}`));
    frame({ grid: g, dieAt: planDecay(g, 'off'), settings: still, bpm: 120, progressMs: 200_000, durationMs: 240_000 }, (x, y, c) => b.push(`${x},${y},${c.ch}`));
    expect(a).toEqual(b);
    // Black draws nothing; grey and white draw, white with the heaviest character.
    expect(a).toHaveLength(12 * 8);
    expect(a).toContain('11,0,@');
    expect(a.some((c) => c.startsWith('0,'))).toBe(false);
  });

  it('colours a character from the cover, or from the chosen look', () => {
    const g = gridFrom([200, 40, 40, 255], 1);
    expect(inkFor(g, 'colour', { ch: '#', l: 0.5, from: 0 })).toMatch(/^rgb\(\d+,\d+,\d+\)$/);
    expect(inkFor(g, 'green', { ch: '#', l: 1, from: 0 })).toBe('rgba(70,255,120,1.000)');
  });
});

describe('ascii cover: moving to the tempo', () => {
  it('is the same picture for the same moment, and hits hardest on the beat', () => {
    expect(sceneAt(17.25, 128)).toEqual(sceneAt(17.25, 128));
    for (const beat of [1, 2, 5, 6, 9]) expect(sceneAt(beat + 0.02, 120).kick).toBeGreaterThan(sceneAt(beat + 0.45, 120).kick);
  });

  it('hits shorter and sharper in a fast song than a slow one', () => {
    // A third of the way to the next beat, a slow song is still swelling.
    expect(sceneAt(1.33, 70).kick).toBeGreaterThan(sceneAt(1.33, 170).kick);
  });

  it('doubles up on the last beat of every fourth bar', () => {
    expect(sceneAt(15.3, 120).fill).toBe(true);
    expect(sceneAt(14.3, 120).fill).toBe(false);
    expect(sceneAt(15.3, 120).tick).toBe(Math.floor(15.3 * 8));
  });

  it('changes the picture when a movement is on, and not when it is off', () => {
    const g = cover(24);
    const shot = (s: AsciiSettings, beats: number) => {
      const out: string[] = [];
      frame({ grid: g, dieAt: planDecay(g, 'off'), settings: s, bpm: 120, progressMs: beats * 500, durationMs: 240_000 }, (x, y, c) => out.push(`${x},${y},${c.ch}`));
      return out.join(' ');
    };
    for (const key of ['glitch', 'blocks', 'shimmer'] as const) {
      const on = { ...still, [key]: true };
      // Somewhere in the first few bars it must differ from the still picture.
      expect([1.02, 2.02, 3.02, 5.02, 6.02].some((b) => shot(on, b) !== shot(still, b)), key).toBe(true);
    }
  });

  it('never reads outside the cover', () => {
    const g = cover(8);
    const wild = { ...still, glitch: true, blocks: true, shimmer: true };
    for (let b = 0; b < 40; b += 0.37) {
      frame({ grid: g, dieAt: planDecay(g, 'off'), settings: wild, bpm: 180, progressMs: b * 333, durationMs: 60_000 }, (_x, _y, c) => {
        expect(c.from).toBeGreaterThanOrEqual(0);
        expect(c.from).toBeLessThan(64);
      });
    }
  });
});

describe('ascii cover: wearing away with the song', () => {
  it('spreads the visible characters across the whole song and leaves blanks alone', () => {
    const g = cover();
    const dieAt = planDecay(g, 'dissolve');
    const visible = Array.from(dieAt).filter((d) => d <= 1);
    expect(visible).toHaveLength(12 * 8);
    expect(Math.min(...visible)).toBeCloseTo(0.01, 5);
    expect(Math.max(...visible)).toBeCloseTo(0.99, 5);
    expect(Array.from(planDecay(g, 'off')).every((d) => d > 1)).toBe(true);
  });

  it('erode takes the dark parts first', () => {
    const g = cover();
    const dieAt = planDecay(g, 'erode');
    const avg = (from: number, to: number) => { let s = 0, c = 0; for (let y = 0; y < 12; y++) for (let x = from; x < to; x++) { s += dieAt[y * 12 + x]; c++; } return s / c; };
    expect(avg(4, 8)).toBeLessThan(avg(8, 12));
  });

  it('close in takes the edges before the middle', () => {
    const px = new Uint8ClampedArray(16 * 16 * 4).fill(255);
    const dieAt = planDecay(gridFrom(px, 16), 'edges');
    expect(dieAt[0]).toBeLessThan(dieAt[8 * 16 + 8]);
    expect(dieAt[15 * 16 + 15]).toBeLessThan(dieAt[7 * 16 + 7]);
  });

  it('steps once per beat of the song', () => {
    expect(goneAt(0.5, 480)).toBe(0.5);
    expect(goneAt(0.5009, 480)).toBe(0.5);
    expect(goneAt(0.5021, 480)).toBeCloseTo(241 / 480, 9);
    expect(goneAt(2, 480)).toBe(1);
    expect(goneAt(0.3, 0)).toBe(0.3);
  });

  it('thins out steadily and is empty when the song ends', () => {
    const g = cover(24);
    for (const decay of ['dissolve', 'erode', 'edges'] as const) {
      const s = { ...still, decay };
      const left = [0, 0.25, 0.5, 0.75, 1].map((p) => count(g, s, p * 240_000));
      expect(left[0], decay).toBeGreaterThan(24 * 16 * 0.95);
      for (let i = 1; i < left.length; i++) expect(left[i], decay).toBeLessThan(left[i - 1]);
      expect(left[2] / left[0], decay).toBeGreaterThan(0.4);
      expect(left[2] / left[0], decay).toBeLessThan(0.6);
      expect(left[4], decay).toBe(0);
    }
  });

  it('comes back when you skip backwards', () => {
    const g = cover(24), s = { ...still, decay: 'dissolve' as const };
    expect(count(g, s, 30_000)).toBeGreaterThan(count(g, s, 200_000));
  });

  it('a cell already gone draws nothing, whatever the effects', () => {
    const g = cover(), dieAt = planDecay(g, 'dissolve');
    const i = Array.from(dieAt).findIndex((d) => d < 0.3);
    const s = { ...still, decay: 'dissolve' as const, glitch: true, blocks: true, shimmer: true };
    expect(cellAt(g, dieAt, s, sceneAt(8.01, 120), i % 12, Math.floor(i / 12), 0.5, 0.02)).toBeNull();
  });

  it('hash is repeatable and stays between 0 and 1', () => {
    for (let i = 0; i < 200; i++) { const v = hash(i, i * 3, i / 7); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
    expect(hash(3, 4, 5)).toBe(hash(3, 4, 5));
  });
});
