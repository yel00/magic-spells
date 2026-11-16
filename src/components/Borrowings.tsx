import { useState } from 'react';
import { mbSamples, mergeBorrowings, whoSampledUrl, type Borrowed } from '../enrich/borrowings';
import { sameName } from '../enrich/text';
import type { RelatedSongs } from '../enrich/types';
import { useData } from '../lib/useData';
import * as api from '../spotify/api';
import { isDemo } from '../spotify/auth';
import type { Track } from '../spotify/types';
import { commands } from '../state/player';
import { toast } from '../state/ui';

function Row({ item }: { item: Borrowed }) {
  const [busy, setBusy] = useState(false);
  const play = async () => {
    if (!item.artist) return void (item.url && window.open(item.url, '_blank', 'noopener'));
    setBusy(true);
    try {
      const want = item.artist.split(/ feat\.? | & |, /i)[0];
      const r = await api.searchTrack(item.title, want);
      const hit = (r.tracks?.items || []).find((t) => t.artists.some((a) => sameName(a.name, want)));
      if (hit) {
        await commands.playTracks([hit.uri]);
        toast(`Playing “${hit.name}” by ${hit.artists[0].name}`);
      } else toast(`Spotify doesn’t have “${item.title}”.`);
    } catch {
      toast('Couldn’t reach Spotify to look that up.');
    }
    setBusy(false);
  };
  return (
    <button className="work" onClick={play} disabled={busy}>
      <span className="row-text">
        <span className="row-title">{item.title}</span>
        <span className="row-sub">{[item.artist, `per ${item.sources.join(' and ')}`].filter(Boolean).join(' · ')}</span>
      </span>
      {busy && <span className="spinner" />}
    </button>
  );
}

/**
 * Samples and borrowed melodies or riffs, in both directions. `genius` is the
 * song's relationship list from Genius when that is connected; MusicBrainz is
 * checked as well and needs no key.
 */
export function Borrowings({ track, genius, geniusPending }: { track: Track; genius: RelatedSongs[] | undefined; geniusPending: boolean }) {
  const artist = track.artists[0]?.name || '';
  const music = useData(`samples:${track.uri}`, () => (isDemo() ? Promise.resolve(false as const) : mbSamples({ name: track.name, artist }).then((v) => v ?? false)));
  const groups = mergeBorrowings(genius, music.data || null);
  const pending = geniusPending || music.loading;
  return (
    <div className="songtabs borrowings">
      <h3>Samples and borrowed parts</h3>
      {groups.map((g) => (
        <div key={g.kind} className="credit-group">
          <p className="borrow-label"><strong>{g.label}</strong><span>{g.hint}</span></p>
          <div className="works">{g.items.map((i, n) => <Row key={n} item={i} />)}</div>
        </div>
      ))}
      {!groups.length && <p className="facts">{pending ? 'Checking for samples and borrowed riffs…' : 'No samples or borrowed riffs are on record for this song.'}</p>}
      <div className="chips">
        <a className="chip chip-link" href={whoSampledUrl(track.name, artist)} target="_blank" rel="noreferrer">Check WhoSampled ↗</a>
      </div>
    </div>
  );
}
