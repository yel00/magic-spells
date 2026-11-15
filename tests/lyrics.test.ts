import { describe, expect, it } from 'vitest';
import { activeLine, parseLrc, pickRecord, shape } from '../src/lyrics';

describe('synced lyrics', () => {
  const lrc = '[ti:Song]\n[00:12.50] First line\n[00:15.2]Second line\n[01:02.345] Third\n[00:20.00][01:10.00] Chorus\n[00:18.00]\nnot a timed line';
  const lines = parseLrc(lrc);

  it('parses timestamps, repeats and blank beats, in time order', () => {
    expect(lines).toEqual([
      { t: 12500, text: 'First line' }, { t: 15200, text: 'Second line' }, { t: 18000, text: '' },
      { t: 20000, text: 'Chorus' }, { t: 62345, text: 'Third' }, { t: 70000, text: 'Chorus' },
    ]);
  });
  it('finds the line being sung', () => {
    expect(activeLine(lines, 0)).toBe(-1);
    expect(activeLine(lines, 12500)).toBe(0);
    expect(activeLine(lines, 19999)).toBe(2);
    expect(activeLine(lines, 65000)).toBe(4);
    expect(activeLine(lines, 999999)).toBe(5);
    expect(activeLine([], 5000)).toBe(-1);
  });
});

describe('choosing lyrics', () => {
  it('prefers synced, falls back to plain, and recognises instrumentals', () => {
    expect(shape({ syncedLyrics: '[00:01.00] hi', plainLyrics: 'hi' })).toEqual({ lines: [{ t: 1000, text: 'hi' }], synced: true, instrumental: false });
    expect(shape({ syncedLyrics: null, plainLyrics: 'one\n\ntwo' })).toEqual({ lines: [{ t: null, text: 'one' }, { t: null, text: '' }, { t: null, text: 'two' }], synced: false, instrumental: false });
    expect(shape({ instrumental: true })).toEqual({ lines: [], synced: false, instrumental: true });
    expect(shape({ plainLyrics: '  ' })).toBeNull();
  });
  it('only accepts lyrics timed for a recording of the same length', () => {
    const records = [
      { duration: 300, syncedLyrics: '[00:01.00] live version' },
      { duration: 263, plainLyrics: 'plain, close' },
      { duration: 265, syncedLyrics: '[00:01.00] synced, close' },
      { duration: 264, plainLyrics: '' },
    ];
    expect(pickRecord(records, 264000)?.syncedLyrics).toContain('synced, close');
    expect(pickRecord(records.slice(0, 2), 264000)?.plainLyrics).toBe('plain, close');
    expect(pickRecord(records.slice(0, 1), 264000)).toBeNull();
  });
});
