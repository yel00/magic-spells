import { describe, expect, it } from 'vitest';
import { detectPitch, Listener, tapTempo } from '../src/tools/dsp';
import { camelot, estimateKey, keyName, noteFor, parseKey } from '../src/tools/keys';

const SR = 48000;
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** A short plucked-string-like tone: a few harmonics with a decay. */
function addNote(out: Float32Array, start: number, midi: number, seconds: number, gain = 0.2) {
  const f = hz(midi);
  const n = Math.floor(seconds * SR);
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / SR;
    const env = Math.exp(-2.5 * t) * Math.min(1, i / 200);
    out[start + i] += gain * env * (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t));
  }
}

function addDrum(out: Float32Array, start: number, kick: boolean) {
  const n = Math.floor(0.08 * SR);
  let seed = start + 1;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / SR;
    seed = (seed * 16807) % 2147483647;
    const noise = seed / 2147483647 - 0.5;
    out[start + i] += kick ? 0.8 * Math.exp(-40 * t) * Math.sin(2 * Math.PI * 60 * t) : 0.5 * Math.exp(-50 * t) * noise;
  }
}

/** A song: drums on every beat plus one chord per bar from `chords` (each a list of MIDI notes). */
function song(bpm: number, chords: number[][], seconds: number): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SR));
  const beat = (60 / bpm) * SR;
  for (let b = 0; b * beat < out.length; b++) {
    const at = Math.round(b * beat);
    addDrum(out, at, b % 2 === 0);
    if (b % 4 === 0) chords[(b / 4) % chords.length].forEach((m) => addNote(out, at, m, (60 / bpm) * 4));
    if (b % 2 === 1) addNote(out, at, chords[Math.floor(b / 4) % chords.length][0] + 12, 0.4, 0.1);
  }
  return out;
}

function listen(audio: Float32Array) {
  const l = new Listener(SR);
  for (let i = 0; i < audio.length; i += 2048) l.push(audio.subarray(i, i + 2048));
  return l.read();
}

const triad = (root: number, minor = false) => [root, root + (minor ? 3 : 4), root + 7];
// I–V–vi–IV in C major, and i–VI–III–VII in A minor.
const C_MAJOR = [triad(48), triad(55), triad(57, true), triad(53)];
const A_MINOR = [triad(57, true), triad(53), triad(48), triad(55)];
const up = (chords: number[][], semitones: number) => chords.map((c) => c.map((m) => m + semitones));

describe('listening to synthesised music', () => {
  it.each([90, 120, 128, 140])('hears %i BPM', (bpm) => {
    const r = listen(song(bpm, C_MAJOR, 16));
    expect(r.tempo).not.toBeNull();
    expect(Math.abs(r.tempo!.bpm - bpm)).toBeLessThan(1.5);
  });

  it('may hear a very fast song at half speed (the app shows both)', () => {
    const bpm = listen(song(174, C_MAJOR, 16)).tempo!.bpm;
    expect(Math.min(Math.abs(bpm - 174), Math.abs(bpm * 2 - 174))).toBeLessThan(1.5);
  });

  it('hears the key of a major progression, in any transposition', () => {
    expect(keyName(listen(song(100, C_MAJOR, 20)).key!.key)).toBe('C major');
    expect(keyName(listen(song(100, up(C_MAJOR, 6), 20)).key!.key)).toBe('F♯ major');
    expect(keyName(listen(song(100, up(C_MAJOR, 10), 20)).key!.key)).toBe('B♭ major');
  });

  it('tells a minor key from its relative major', () => {
    // Ending and resting on the A minor chord, as a minor song does.
    const audio = song(100, [...A_MINOR, triad(57, true), triad(52, true), triad(57, true), triad(57, true)], 24);
    expect(keyName(listen(audio).key!.key)).toBe('A minor');
  });

  it('reports nothing for silence', () => {
    const r = listen(new Float32Array(SR * 8));
    expect(r.tempo).toBeNull();
    expect(r.key).toBeNull();
    expect(r.pitch).toBeNull();
  });
});

describe('pitch of a single note', () => {
  const tone = (f: number) => Float32Array.from({ length: 4096 }, (_, i) => 0.3 * (Math.sin((2 * Math.PI * f * i) / SR) + 0.4 * Math.sin((4 * Math.PI * f * i) / SR)));
  it.each([[82.41, 'E', 2], [110, 'A', 2], [196, 'G', 3], [440, 'A', 4], [987.77, 'B', 5]])('reads %f Hz as %s%i', (f, name, octave) => {
    const p = detectPitch(tone(f), SR);
    expect(p).not.toBeNull();
    expect(noteFor(p!)).toMatchObject({ name, octave });
    expect(Math.abs(noteFor(p!).cents)).toBeLessThanOrEqual(3);
  });
  it('shows how sharp or flat a note is', () => {
    expect(noteFor(detectPitch(tone(446), SR)!).cents).toBeGreaterThan(15);
    expect(noteFor(detectPitch(tone(434), SR)!).cents).toBeLessThan(-15);
  });
});

describe('keys', () => {
  it('names keys and Camelot codes', () => {
    expect(camelot({ tonic: 0, mode: 'major' })).toBe('8B');
    expect(camelot({ tonic: 9, mode: 'minor' })).toBe('8A');
    expect(camelot({ tonic: 4, mode: 'minor' })).toBe('9A');
    expect(camelot({ tonic: 6, mode: 'major' })).toBe('2B');
    expect(parseKey('C#', 'minor')).toEqual({ tonic: 1, mode: 'minor' });
    expect(parseKey('Bb', 'major')).toEqual({ tonic: 10, mode: 'major' });
    expect(parseKey('H', 'major')).toBeNull();
  });
  it('needs some sound to judge a key', () => {
    expect(estimateKey(new Float32Array(12))).toBeNull();
  });
});

describe('tap tempo', () => {
  it('uses the median gap and ignores one bad tap', () => {
    expect(tapTempo([0, 500])).toBeNull();
    expect(Math.round(tapTempo([0, 500, 1000, 1500, 2000])!)).toBe(120);
    expect(Math.round(tapTempo([0, 500, 1000, 1900, 2400, 2900])!)).toBe(120);
  });
});

describe('tempo lookup', () => {
  it('prefers recordings whose length matches the track', async () => {
    const { rankRecordings, combine } = await import('../src/tools/lookup');
    const recs = [{ id: 'live', length: 380000 }, { id: 'studio', length: 294500 }, { id: 'unknown', length: null }, { id: 'reissue', length: 291000 }];
    expect(rankRecordings(recs, 294000)).toEqual({ near: ['studio', 'reissue'], rest: ['live', 'unknown'] });
    expect(rankRecordings(recs)).toEqual({ near: [], rest: ['live', 'studio', 'unknown', 'reissue'] });
    expect(combine([])).toBeNull();
    expect(combine([
      { rhythm: { bpm: 117.2 }, tonal: { key_key: 'F#', key_scale: 'minor', key_strength: 0.8 } },
      { rhythm: { bpm: 116.9 }, tonal: { key_key: 'F#', key_scale: 'minor', key_strength: 0.7 } },
      { rhythm: { bpm: 234 }, tonal: { key_key: 'A', key_scale: 'major', key_strength: 0.9 } },
    ])).toEqual({ bpm: 117, key: { tonic: 6, mode: 'minor' }, samples: 3 });
  });
});

describe('tab search', () => {
  it('keeps this artist’s tab, names its instruments and builds the link', async () => {
    // @ts-expect-error plain JS module shared with the server function
    const { shapeTabs } = await import('../api/_lib/tabs.js');
    const json = [
      { songId: 16501, artist: 'Radiohead', title: 'Paranoid Android', hasChords: true, tracks: [
        { instrument: 'Distortion Guitar', name: 'Jonny Greenwood' }, { instrument: 'Electric Bass (finger)', name: 'Colin' },
        { instrument: 'Drums', name: 'Phil Selway' }, { instrument: 'Acoustic Grand Piano', name: 'Keys' } ] },
      { songId: 2, artist: 'Some Cover Band', title: 'Paranoid Android', tracks: [] },
      { songId: 3, artist: 'Radiohead', title: 'Paranoid', tracks: [] },
    ];
    expect(shapeTabs(json, 'Paranoid Android', 'radiohead')).toEqual([{
      id: 16501, title: 'Paranoid Android', artist: 'Radiohead',
      url: 'https://www.songsterr.com/a/wsa/radiohead-paranoid-android-tab-s16501',
      parts: ['Guitar', 'Bass', 'Keys', 'Drums'], chords: true,
    }]);
    expect(shapeTabs({ error: 'x' }, 'a', 'b')).toEqual([]);
  });
  it('recognises tab file types', async () => {
    const { isTabFile, tabSearchLinks } = await import('../src/tools/tabs');
    expect(['song.gp5', 'Song.GPX', 'piece.musicxml', 'x.mxl'].every(isTabFile)).toBe(true);
    expect(['song.mid', 'song.pdf', 'noextension'].some(isTabFile)).toBe(false);
    expect(tabSearchLinks('Heroes - 2017 Remaster', 'David Bowie')[1].url).toBe('https://www.ultimate-guitar.com/search.php?search_type=title&value=David%20Bowie%20Heroes');
  });
});
