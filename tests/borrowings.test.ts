import { describe, expect, it } from 'vitest';
import { BORROW_LABELS, mergeBorrowings, samplesFrom, whoSampledUrl } from '../src/enrich/borrowings';

describe('samples recorded in MusicBrainz', () => {
  const rel = (direction: string, title: string, artist: string, type = 'samples material') => ({ type, direction, 'target-type': 'recording', recording: { title, 'artist-credit': artist ? [{ name: artist, artist: { name: artist } }] : [] } });
  it('separates what a song samples from what samples it', () => {
    const found = samplesFrom({ relations: [rel('forward', 'Funky Drummer', 'James Brown'), rel('backward', 'A Later Song', 'Someone'), rel('forward', 'Not a sample', 'X', 'remix'), { type: 'samples material', 'target-type': 'work', work: { title: 'ignored' } }] });
    expect(found).toEqual({ samples: [{ title: 'Funky Drummer', artist: 'James Brown' }], sampledBy: [{ title: 'A Later Song', artist: 'Someone' }] });
    expect(samplesFrom({})).toEqual({ samples: [], sampledBy: [] });
  });
});

describe('combining sources', () => {
  const genius = [
    { label: 'Samples', songs: [{ title: 'Funky Drummer', artist: 'James Brown', url: 'g1' }] },
    { label: 'Interpolates', songs: [{ title: 'Under Pressure', artist: 'Queen & David Bowie', url: 'g2' }] },
    { label: 'Covered by', songs: [{ title: 'x', artist: 'y', url: 'g3' }] },
  ];
  const music = { samples: [{ title: 'Funky Drummer (Remastered)', artist: 'James Brown' }, { title: 'Impeach the President', artist: 'The Honey Drippers' }], sampledBy: [{ title: 'A Later Song', artist: '' }] };
  const groups = mergeBorrowings(genius, music);

  it('lists a song once when both sources name it, and credits both', () => {
    const samples = groups.find((g) => g.kind === 'samples')!;
    expect(samples.items).toEqual([
      { title: 'Funky Drummer', artist: 'James Brown', url: 'g1', sources: ['Genius', 'MusicBrainz'] },
      { title: 'Impeach the President', artist: 'The Honey Drippers', url: undefined, sources: ['MusicBrainz'] },
    ]);
  });
  it('keeps a replayed melody or riff separate from a sample, and leaves covers out', () => {
    expect(groups.map((g) => g.kind)).toEqual(['samples', 'interpolates', 'sampled_in']);
    expect(groups.find((g) => g.kind === 'interpolates')!.items[0]).toMatchObject({ title: 'Under Pressure', sources: ['Genius'] });
    expect(BORROW_LABELS.has('Covered by')).toBe(false);
  });
  it('works with either source missing, and shows nothing when neither has anything', () => {
    expect(mergeBorrowings(undefined, music).map((g) => g.kind)).toEqual(['samples', 'sampled_in']);
    expect(mergeBorrowings(genius, null).map((g) => g.kind)).toEqual(['samples', 'interpolates']);
    expect(mergeBorrowings(undefined, null)).toEqual([]);
  });
  it('builds the WhoSampled search without edition wording', () => {
    expect(whoSampledUrl('Ice Ice Baby - Remastered', 'Vanilla Ice')).toBe('https://www.whosampled.com/search/?q=Vanilla%20Ice%20Ice%20Ice%20Baby');
  });
});
