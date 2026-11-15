import { useEffect, useRef, useState } from 'react';
import { findWork, MAX_PAGES, PAGE, sortRecordings, workPage, type Recording, type Work } from '../enrich/recordings';
import { norm, sameName } from '../enrich/text';
import { year } from '../lib/format';
import { go } from '../lib/router';
import { useData } from '../lib/useData';
import * as api from '../spotify/api';
import { isDemo } from '../spotify/auth';
import { editionLabel, otherEditions } from '../spotify/editions';
import type { Album, Track } from '../spotify/types';
import { classify, titleMatches } from '../spotify/versions';
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

/** A version Spotify has: plays on tap. `lead` is what distinguishes it (the artist for a cover, the take for the same artist). */
function PlayableRow({ track, lead }: { track: Track; lead: 'artist' | 'take' }) {
  const who = track.artists.map((a) => a.name).join(', ');
  const title = lead === 'artist' ? who : track.name;
  const sub = lead === 'artist' ? [track.name, track.album?.name].filter(Boolean).join(' · ') : [track.album?.name, year(track.album?.release_date)].filter(Boolean).join(' · ');
  return (
    <button className="version" onClick={() => commands.playTracks([track.uri])}>
      <Art images={track.album?.images} size={44} />
      <span className="row-text"><span className="row-title">{title}</span><span className="row-sub">{sub}</span></span>
    </button>
  );
}

/** A recording MusicBrainz knows of that hasn't turned up on Spotify yet: tap to look for it. */
function LookupRow({ rec }: { rec: Recording }) {
  const [busy, setBusy] = useState(false);
  const play = async () => {
    setBusy(true);
    try {
      const want = rec.artists[0] || rec.artist;
      const r = await api.searchTrack(rec.title, want);
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

function Group<T>({ title, items, render, first = 6 }: { title: string; items: T[]; render: (item: T, i: number) => JSX.Element; first?: number }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  return (
    <div className="credit-group">
      <h3>{title} · {items.length}</h3>
      <div className="versions">{(all ? items : items.slice(0, first)).map(render)}</div>
      {items.length > first && <button className="link-quiet" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${items.length}`}</button>}
    </div>
  );
}

/**
 * Every version of a song the app can find. Two sources are combined:
 * Spotify (what can be played now, found by title) and MusicBrainz (which
 * artists have recorded this composition). Looked up only when asked for.
 */
export function SongVersions({ track }: { track: Track }) {
  const [asked, setAsked] = useState(false);
  const artist = track.artists[0]?.name || '';
  const [spotify, setSpotify] = useState<Track[]>([]);
  const [spotifyPages, setSpotifyPages] = useState(0);
  const [spotifyMore, setSpotifyMore] = useState(true);
  const [work, setWork] = useState<Work | null | undefined>(undefined);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [mbPages, setMbPages] = useState(0);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(() => () => void (live.current = false), []);

  const loadSpotify = async (pages: number) => {
    const found: Track[] = [];
    let more = true;
    for (let p = spotifyPages; p < spotifyPages + pages && more; p++) {
      const r = await titleMatches(track.name, p).catch(() => ({ tracks: [] as Track[], more: false }));
      found.push(...r.tracks);
      more = r.more;
    }
    if (!live.current) return;
    setSpotify((cur) => [...cur, ...found]);
    setSpotifyPages((n) => n + pages);
    setSpotifyMore(more);
  };

  const loadMusicBrainz = async (w: Work, pages: number) => {
    const found: Recording[] = [];
    let p = mbPages;
    for (; p < mbPages + pages && p < MAX_PAGES && p * PAGE < w.total; p++) found.push(...(p === 0 ? w.first : await workPage(w.id, p)));
    if (!live.current) return;
    setRecordings((cur) => [...cur, ...found]);
    setMbPages(p);
  };

  const start = async () => {
    setAsked(true);
    setBusy(true);
    const w = isDemo() ? demoWork(track.name, artist) : await findWork({ name: track.name, artist }).catch(() => null);
    if (live.current) setWork(w);
    await Promise.all([loadSpotify(3), w ? loadMusicBrainz(w, 1) : Promise.resolve()]);
    if (live.current) setBusy(false);
  };

  const mbLeft = work ? Math.min(work.total, MAX_PAGES * PAGE) - mbPages * PAGE : 0;
  const more = async () => {
    setBusy(true);
    await Promise.all([spotifyMore ? loadSpotify(3) : Promise.resolve(), work && mbLeft > 0 ? loadMusicBrainz(work, 3) : Promise.resolve()]);
    if (live.current) setBusy(false);
  };

  if (!asked) return <button className="btn btn-small versions-ask" onClick={start}>Find every version of this song</button>;

  const known = sortRecordings(recordings, track.name, artist);
  const coverArtists = new Set(known.byOthers.flatMap((r) => r.artists.map(norm)));
  const onSpotify = classify(spotify, { name: track.name, artist, uri: track.uri }, coverArtists);
  // Covers Spotify has are listed first and are playable; the rest need a lookup.
  const found = new Set(onSpotify.covers.flatMap((t) => t.artists.map((a) => norm(a.name))));
  const notYetFound = known.byOthers.filter((r) => !r.artists.some((a) => found.has(norm(a))));
  const nothing = !busy && !onSpotify.sameArtist.length && !onSpotify.covers.length && !onSpotify.unconfirmed.length && !notYetFound.length && !known.bySameArtist.length;

  return (
    <div className="songtabs song-versions">
      {busy && work === undefined && <><p className="facts">Looking for other versions…</p><AboutSkeleton /></>}
      {nothing && <p className="facts">No other versions of this song turned up.</p>}
      <Group title={`Other versions by ${artist} on Spotify`} items={onSpotify.sameArtist} render={(t) => <PlayableRow key={t.uri} track={t} lead="take" />} />
      <Group title="Covers on Spotify" items={onSpotify.covers} render={(t) => <PlayableRow key={t.uri} track={t} lead="artist" />} />
      <Group title="Also recorded by" items={notYetFound} render={(r, i) => <LookupRow key={i} rec={r} />} />
      <Group title={`${artist}: other takes on record`} items={known.bySameArtist} render={(r, i) => <LookupRow key={i} rec={r} />} first={4} />
      <Group title="Same title on Spotify — may be a different song" items={onSpotify.unconfirmed} render={(t) => <PlayableRow key={t.uri} track={t} lead="artist" />} first={4} />
      {work !== undefined && (
        <p className="fineprint flush">
          {work
            ? `MusicBrainz lists ${work.total.toLocaleString()} recordings of this song; ${Math.min(mbPages * PAGE, work.total).toLocaleString()} read so far.`
            : 'MusicBrainz has no record of this song’s other recordings, so covers can’t be confirmed.'}{' '}
          Spotify results are matched by title.
        </p>
      )}
      {work !== undefined && (spotifyMore || mbLeft > 0) && (
        <button className="btn btn-small versions-ask" onClick={more} disabled={busy}>{busy ? 'Loading…' : 'Load more'}</button>
      )}
    </div>
  );
}

function demoWork(title: string, artist: string): Work {
  const rec = (a: string, y: string, note?: string): Recording => ({ title, artist: a, artists: [a], year: y, note });
  return { id: 'demo', total: 4, first: [rec('Night Ferry', '2016'), rec('Glass Orchard', '2019', 'acoustic'), rec('A Band Not On Spotify', '2021'), rec(artist, '2015', 'live at Harbor Hall')] };
}
