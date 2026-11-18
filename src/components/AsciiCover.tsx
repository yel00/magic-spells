import { useEffect, useRef, useState } from 'react';
import { frame, gridFrom, inkFor, planDecay, type AsciiSettings, type Decay, type Grid, type Look } from '../ascii/engine';
import { ascii, setAscii } from '../ascii/store';
import { useStore } from '../lib/store';
import { currentProgress, player } from '../state/player';

const COLS = 48;
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";
/** Thirty pictures a second is smooth enough and easy on the battery. */
const FRAME_MS = 1000 / 30;

/** Reads the cover into a grid of characters. Rejects if the picture can't be read. */
function loadGrid(src: string): Promise<Grid> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Without this the browser lets us show the picture but not look at its pixels.
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = COLS;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.imageSmoothingQuality = 'high';
        const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h);
        // Covers are square. Only crop when a picture clearly isn't: a drawing with no fixed
        // size of its own reports one the browser made up, and cropping by that cuts it wrong.
        if (side > 0 && Math.abs(w - h) > 2 && !src.startsWith('data:image/svg')) ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, COLS, COLS);
        else ctx.drawImage(img, 0, 0, COLS, COLS);
        resolve(gridFrom(ctx.getImageData(0, 0, COLS, COLS).data, COLS));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('cover unavailable'));
    img.src = src;
  });
}

/** The cover in characters, moving to the tempo and wearing away with the song. */
export function AsciiCover({ src, bpm, durationMs, onFail }: { src: string; bpm: number; durationMs: number; onFail: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const settings = useStore(ascii);
  const [grid, setGrid] = useState<Grid | null>(null);
  const live = useRef({ settings, bpm, durationMs });
  live.current = { settings, bpm, durationMs };

  useEffect(() => {
    let current = true;
    setGrid(null);
    loadGrid(src).then((g) => current && setGrid(g), () => current && onFail());
    return () => {
      current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    const el = canvas.current;
    if (!grid || !el) return;
    const ctx = el.getContext('2d')!;
    const dieAt = planDecay(grid, settings.decay);
    let raf = 0, last = 0;

    const draw = () => {
      const box = el.getBoundingClientRect();
      const px = Math.max(1, Math.round(box.width * Math.min(window.devicePixelRatio || 1, 2)));
      if (el.width !== px) el.width = el.height = px;
      const cell = px / grid.n;
      const now = live.current;
      ctx.fillStyle = '#050507';
      ctx.fillRect(0, 0, px, px);
      ctx.font = `700 ${cell * 1.34}px ${MONO}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      frame({ grid, dieAt, settings: now.settings, bpm: now.bpm, progressMs: currentProgress(), durationMs: now.durationMs }, (x, y, c) => {
        ctx.fillStyle = inkFor(grid, now.settings.look, c);
        ctx.fillText(c.ch, (x + 0.5) * cell, (y + 0.52) * cell);
      });
    };

    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || t - last < FRAME_MS) return;
      // While paused the picture holds still, so there is nothing new to draw.
      if (!player.get().playback?.is_playing && last) return;
      last = t;
      draw();
    };
    draw();
    raf = requestAnimationFrame(loop);
    // Redraw at once when paused, resumed, skipped or resized.
    const stop = player.subscribe(() => {
      last = 0;
    });
    const resize = new ResizeObserver(() => draw());
    resize.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      stop();
      resize.disconnect();
    };
  }, [grid, settings.decay, settings.look, settings.glitch, settings.blocks, settings.shimmer]);

  return <canvas ref={canvas} className="art ascii-art" role="img" aria-label="The album cover drawn in characters" />;
}

const MOVES: { key: 'glitch' | 'blocks' | 'shimmer'; name: string }[] = [
  { key: 'glitch', name: 'Glitch' },
  { key: 'blocks', name: 'Blocks' },
  { key: 'shimmer', name: 'Shimmer' },
];
const DECAYS: { id: Decay; name: string }[] = [
  { id: 'off', name: 'Off' },
  { id: 'dissolve', name: 'Dissolve' },
  { id: 'erode', name: 'Erode' },
  { id: 'edges', name: 'Close in' },
];
const LOOKS: { id: Look; name: string }[] = [
  { id: 'colour', name: 'Cover colours' },
  { id: 'green', name: 'Green' },
  { id: 'amber', name: 'Amber' },
  { id: 'white', name: 'White' },
];

/** Switches for the ASCII cover: which movements, how it wears away, and its colours. */
export function AsciiOptions({ settings, bpm, guessed, onClose }: { settings: AsciiSettings; bpm: number; guessed: boolean; onClose: () => void }) {
  return (
    <div className="ascii-options" role="group" aria-label="ASCII cover options">
      <div className="ascii-row">
        <span>Moves</span>
        {MOVES.map((m) => (
          <button key={m.key} className={`chip chip-tap ${settings[m.key] ? 'chip-on' : ''}`} aria-pressed={settings[m.key]} onClick={() => setAscii({ [m.key]: !settings[m.key] })}>{m.name}</button>
        ))}
      </div>
      <div className="ascii-row">
        <span>Fades</span>
        {DECAYS.map((d) => (
          <button key={d.id} className={`chip chip-tap ${settings.decay === d.id ? 'chip-on' : ''}`} aria-pressed={settings.decay === d.id} onClick={() => setAscii({ decay: d.id })}>{d.name}</button>
        ))}
      </div>
      <div className="ascii-row">
        <span>Colour</span>
        {LOOKS.map((l) => (
          <button key={l.id} className={`chip chip-tap ${settings.look === l.id ? 'chip-on' : ''}`} aria-pressed={settings.look === l.id} onClick={() => setAscii({ look: l.id })}>{l.name}</button>
        ))}
      </div>
      <div className="ascii-foot">
        <p className="ascii-note">{guessed ? `No tempo on file for this song: moving at ${bpm} BPM.` : `Moving at about ${bpm} BPM.`} A fade empties the cover as the song runs out.</p>
        <button className="btn btn-small" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
