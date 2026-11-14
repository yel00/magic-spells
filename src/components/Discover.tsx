import { useEffect, useState } from 'react';
import { buildArtistMix, buildSurpriseMix, findOnSpotify, findVideos, similarArtists, VideosNotConfigured, youtubeSearchUrl, type Mix, type Video } from '../discover';
import { mapLimit } from '../discover/mix';
import { norm } from '../enrich/text';
import { formatDuration } from '../lib/format';
import { go } from '../lib/router';
import { useStore } from '../lib/store';
import { invalidate, useData } from '../lib/useData';
import * as api from '../spotify/api';
import { commands, player } from '../state/player';
import { toast, ui } from '../state/ui';
import { AboutSkeleton } from './About';
import { PlayIcon } from './Icons';
import { Card, Shelf } from './Shelf';
import { TrackRow } from './TrackRow';

/** Similar artists as a shelf of cards. `exclude` hides artists the listener already knows. */
export function SimilarShelf({ name, title, exclude }: { name: string; title: string; exclude?: Set<string> }) {
  const { data, loading } = useData(`similar-cards:${name}`, async () => {
    const similar = await similarArtists(name);
    if (!similar) return { source: '', artists: [] };
    const found = await mapLimit(similar.names.slice(0, 12), 3, (n) => findOnSpotify(n).catch(() => null));
    return { source: similar.source, artists: found.filter((a): a is NonNullable<typeof a> => !!a) };
  });
  const artists = (data?.artists || []).filter((a) => !exclude?.has(norm(a.name)));
  if (loading) return <section className="shelf"><h2>{title}</h2><div className="shelf-pad"><AboutSkeleton /></div></section>;
  if (!artists.length) return null;
  return (
    <Shelf title={title}>
      {artists.map((a) => <Card key={a.id} title={a.name} images={a.images} to={`/artist/${a.id}`} round />)}
    </Shelf>
  );
}

/** Live performances and other versions, or a plain link to YouTube when no key is set up. */
export function Videos({ query, title }: { query: string; title: string }) {
  const { data, error, loading } = useData(`videos:${query}`, () => findVideos(query).then((v) => v ?? []));
  if (loading) return null;
  if (error instanceof VideosNotConfigured || (data && !data.length)) {
    return <a className="chip chip-link videos-link" href={youtubeSearchUrl(query)} target="_blank" rel="noreferrer">{title} on YouTube ↗</a>;
  }
  if (error || !data) return null;
  return (
    <section className="shelf videos">
      <h2>{title}</h2>
      <div className="shelf-scroll">
        {data.map((v) => (
          <button key={v.id} className="video" onClick={() => ui.set({ video: v })}>
            <span className="video-thumb"><img src={v.thumb} alt="" loading="lazy" /><span className="video-play"><PlayIcon size={22} /></span></span>
            <span className="card-title">{v.title}</span>
            <span className="card-sub">{v.channel}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function VideoSheet({ video }: { video: Video }) {
  useEffect(() => {
    // Two things playing at once is never wanted: stop the music while the video runs.
    if (player.get().playback?.is_playing) commands.toggle();
  }, [video.id]);
  return (
    <div className="video-sheet">
      <div className="video-frame">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1&playsinline=1&rel=0`}
          title={video.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
      <p className="row-title video-title">{video.title}</p>
      <p className="row-sub">{video.channel}</p>
    </div>
  );
}

export type MixRequest = { kind: 'artist'; seed: string } | { kind: 'surprise'; seeds: string[]; known: string[] };

export function MixSheet({ request }: { request: MixRequest }) {
  const [mix, setMix] = useState<Mix | null>(null);
  const [progress, setProgress] = useState<[number, number]>([0, 1]);
  const [failed, setFailed] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const playing = useStore(player).playback?.item?.uri;

  useEffect(() => {
    let live = true;
    const onProgress = (d: number, t: number) => live && setProgress([d, t]);
    const job = request.kind === 'artist' ? buildArtistMix(request.seed, onProgress) : buildSurpriseMix(request.seeds, new Set(request.known), onProgress);
    job.then(
      (m) => live && (m ? setMix(m) : setFailed('Not enough is known about similar artists to build a mix here.')),
      () => live && setFailed('Couldn’t build the mix just now.'),
    );
    return () => {
      live = false;
    };
    // The request object is created once when the sheet opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) return <p className="status">{failed}</p>;
  if (!mix) {
    return (
      <div className="mix-building">
        <p>Finding artists and their best-known tracks…</p>
        <div className="bar"><span style={{ width: `${(progress[0] / progress[1]) * 100}%` }} /></div>
      </div>
    );
  }

  const uris = mix.tracks.map((t) => t.uri);
  const save = async () => {
    setSaving(true);
    try {
      const p = await api.createPlaylist(mix.title, mix.description);
      await api.addToPlaylist(p.id, uris);
      invalidate('library:playlists');
      toast(`Saved “${mix.title}” to your playlists`);
      ui.set({ mix: null });
      go(`/playlist/${p.id}`);
    } catch {
      toast('Couldn’t save the playlist.');
      setSaving(false);
    }
  };

  return (
    <div className="mix">
      <p className="facts">{mix.tracks.length} tracks · {formatDuration(mix.tracks.reduce((n, t) => n + t.duration_ms, 0))}{playing && uris.includes(playing) ? ' · playing' : ''}</p>
      <div className="hero-actions mix-actions">
        <button className="btn btn-primary" onClick={() => commands.playTracks(uris, 0)}><PlayIcon size={18} /> Play</button>
        <button className="btn" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save as playlist'}</button>
      </div>
      <div className="mix-list">
        {mix.tracks.map((t, i) => <TrackRow key={t.uri} track={t} onPlay={() => commands.playTracks(uris, i)} />)}
      </div>
    </div>
  );
}
