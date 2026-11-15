import { useState } from 'react';
import { otherRecordings, type OtherRecording } from '../enrich/recordings';
import { year } from '../lib/format';
import { go } from '../lib/router';
import { useData } from '../lib/useData';
import * as api from '../spotify/api';
import { isDemo } from '../spotify/auth';
import { editionLabel, otherEditions } from '../spotify/editions';
import type { Album, Track } from '../spotify/types';
import { sameName } from '../enrich/text';
import { commands } from '../state/player';
import { toast } from '../state/ui';
import { AboutSkeleton } from './About';
import { Art } from './Art';

/** Other editions of this album (remasters, deluxe…), from the artist's releases. */
export function AlbumVersions({ album }: { album: Album }) {
  const artistId = album.artists[0]?.id;
  const disc = useData(artistId ? `artist:${artistId}:albums` : null, () => api.artistAlbums(artistId!));
  const others = otherEditions(disc.data?.items || [], album);
  if (!others.length) return null;
  return (
    <section className="about">
      <h2>Versions</h2>
      <div className="versions">
        <div className="version version-current">
          <Art images={album.images} size={44} />
          <span className="row-text"><span className="row-title">{editionLabel(album)}</span><span className="row-sub">{year(album.release_date)} · {album.tracks.total ?? album.tracks.items.length} tracks · this one</span></span>
        </div>
        {others.map((a) => (
          <button key={a.id} className="version" onClick={() => go(`/album/${a.id}`)}>
            <Art images={a.images} size={44} />
            <span className="row-text"><span className="row-title">{editionLabel(a)}</span><span className="row-sub">{[year(a.release_date), a.total_tracks && `${a.total_tracks} tracks`].filter(Boolean).join(' · ')}</span></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function RecordingRow({ rec }: { rec: OtherRecording }) {
  const [busy, setBusy] = useState(false);
  const play = async () => {
    setBusy(true);
    try {
      // Find this artist's recording of the song on Spotify and play it.
      const r = await api.searchTrack(rec.title, rec.artist.split(/ feat\.? | & |, /i)[0]);
      const want = rec.artist.split(/ feat\.? | & |, /i)[0];
      const hit = (r.tracks?.items || []).find((t) => t.artists.some((a) => sameName(a.name, want)));
      if (hit) {
        await commands.playTracks([hit.uri]);
        toast(`Playing ${hit.artists[0].name}’s recording`);
      } else toast(`Spotify doesn’t have ${rec.artist}’s recording.`);
    } catch {
      toast('Couldn’t reach Spotify to look that up.');
    }
    setBusy(false);
  };
  return (
    <button className="work" onClick={play} disabled={busy}>
      <span className="row-text">
        <span className="row-title">{rec.artist}</span>
        <span className="row-sub">{[rec.title, rec.note, rec.year].filter(Boolean).join(' · ')}</span>
      </span>
      {busy && <span className="spinner" />}
    </button>
  );
}

function RecordingList({ title, items }: { title: string; items: OtherRecording[] }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  return (
    <div className="credit-group">
      <h3>{title} · {items.length}</h3>
      <div className="works">{(all ? items : items.slice(0, 6)).map((r, i) => <RecordingRow key={i} rec={r} />)}</div>
      {items.length > 6 && <button className="link-quiet" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
    </div>
  );
}

/** Covers and alternate takes of a song. Looked up only when asked for, since it takes a few seconds. */
export function SongVersions({ track }: { track: Track }) {
  const [asked, setAsked] = useState(false);
  const artist = track.artists[0]?.name || '';
  const found = useData(asked ? `recordings:${track.uri}` : null, () =>
    isDemo() ? Promise.resolve(demoRecordings(track.name, artist)) : otherRecordings({ name: track.name, artist }).then((v) => v ?? false),
  );
  if (!asked) return <button className="btn btn-small versions-ask" onClick={() => setAsked(true)}>Find other recordings of this song</button>;
  return (
    <div className="songtabs">
      {found.loading && <><p className="facts">Looking for covers and other takes…</p><AboutSkeleton /></>}
      {found.data === false && <p className="facts">No other recordings of this song are on record.</p>}
      {found.data && (
        <>
          <RecordingList title="Recorded by others" items={found.data.byOthers} />
          <RecordingList title={`Other takes by ${artist}`} items={found.data.bySameArtist} />
          <p className="fineprint flush">From MusicBrainz. Tap one to play it if Spotify has it.</p>
        </>
      )}
    </div>
  );
}

function demoRecordings(title: string, artist: string) {
  return {
    byOthers: [{ title, artist: 'Night Ferry', year: '2016' }, { title, artist: 'Glass Orchard', year: '2019', note: 'acoustic' }, { title, artist: 'A Band Not On Spotify', year: '2021' }],
    bySameArtist: [{ title, artist, year: '2015', note: 'live at Harbor Hall' }],
  };
}
