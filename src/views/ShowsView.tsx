import { useEffect, useRef, useState } from 'react';
import { Videos } from '../components/Discover';
import { Gallery } from '../components/Gallery';
import { ChevronLeft } from '../components/Icons';
import { NotesSection } from '../components/Notes';
import { ShowRow } from '../components/Shows';
import { findOnSpotify } from '../discover';
import { mapLimit } from '../discover/mix';
import type { Picture } from '../enrich/artwork';
import { go } from '../lib/router';
import { useStore } from '../lib/store';
import { invalidate, useData } from '../lib/useData';
import { notes } from '../notes/store';
import { artistShows, showById, ShowsNotConfigured } from '../shows';
import { groupByBand, groupByYear, longDate, placeLine, recordingQuery, showUri } from '../shows/logic';
import { addPhotos, photosFor, photoSync, removePhoto, showsWithPhotos, type ShowPhoto } from '../shows/photos';
import { markShow, myShows, unmarkShow } from '../shows/store';
import type { SetSong, Show, ShowSummary } from '../shows/types';
import * as api from '../spotify/api';
import { commands } from '../state/player';
import { toast } from '../state/ui';

function Head({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <header className="page-head show-head">
      <button className="icon-btn back-inline" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
      <div>
        {kicker && <span className="kicker">{kicker}</span>}
        <h1>{title}</h1>
      </div>
    </header>
  );
}

const NOT_SET_UP = 'Past shows need a free setlist.fm key. Settings → Extras shows how to add one.';

/** Finds a song from the setlist on Spotify. A cover is looked up under the artist who made it. */
async function findSong(song: SetSong, artist: string): Promise<string | null> {
  try {
    const hit = (await api.searchTrack(song.name, artist)).tracks?.items?.[0] || (song.cover ? (await api.searchTrack(song.name, song.cover)).tracks?.items?.[0] : undefined);
    return hit ? hit.uri : null;
  } catch {
    return null;
  }
}

function Setlist({ show }: { show: Show }) {
  const [busy, setBusy] = useState(false);
  const songs = show.sets.flatMap((s) => s.songs).filter((s) => !s.tape);

  const collect = async () => (await mapLimit(songs, 3, (s) => findSong(s, show.artist.name))).filter((u): u is string => !!u);

  const playAll = async () => {
    setBusy(true);
    const uris = await collect();
    setBusy(false);
    if (!uris.length) return toast('None of these songs were found on Spotify.');
    await commands.playTracks(uris);
    if (uris.length < songs.length) toast(`Playing ${uris.length} of ${songs.length} songs. The rest aren’t on Spotify.`);
  };

  const save = async () => {
    setBusy(true);
    try {
      const uris = await collect();
      if (!uris.length) throw new Error('none');
      const p = await api.createPlaylist(`${show.artist.name} at ${show.venue || show.city}, ${longDate(show.date)}`, `The setlist from the night, in order (studio versions). ${show.url}`);
      await api.addToPlaylist(p.id, uris);
      invalidate('library:playlists');
      toast(`Saved ${uris.length} songs to your Spotify playlists`);
    } catch {
      toast('Couldn’t save the playlist.');
    }
    setBusy(false);
  };

  const playOne = async (song: SetSong) => {
    const uri = await findSong(song, show.artist.name);
    if (uri) await commands.playTracks([uri]);
    else toast(`“${song.name}” wasn’t found on Spotify.`);
  };

  if (!songs.length) {
    return (
      <section className="about">
        <h2>Setlist</h2>
        <p className="facts">Nobody has written down what was played yet. If you were there, you can add it on setlist.fm.</p>
      </section>
    );
  }
  let n = 0;
  return (
    <section className="about">
      <h2>Setlist</h2>
      <div className="setting-actions">
        <button className="btn btn-primary btn-small" onClick={playAll} disabled={busy}>{busy ? 'Finding songs…' : 'Play the setlist'}</button>
        <button className="btn btn-small" onClick={save} disabled={busy}>Save as playlist</button>
      </div>
      <p className="fineprint flush">Plays the studio versions from Spotify in the order of the night.</p>
      {show.sets.map((set, i) => (
        <div key={i} className="setlist-set">
          {set.name && <h3>{set.name}</h3>}
          <ol className="setlist">
            {set.songs.map((song, j) => (
              <li key={j}>
                <button className="setlist-song" onClick={() => playOne(song)} disabled={song.tape}>
                  <span className="setlist-n">{song.tape ? '·' : ++n}</span>
                  <span className="row-text">
                    <span className="row-title">{song.name}</span>
                    {(song.cover || song.guest || song.info || song.tape) && (
                      <span className="row-sub">{[song.tape && 'played from tape', song.cover && `${song.cover} cover`, song.guest && `with ${song.guest}`, song.info].filter(Boolean).join(' · ')}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  );
}

function MyPhotos({ show }: { show: Show }) {
  const [photos, setPhotos] = useState<ShowPhoto[]>([]);
  const [editing, setEditing] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);

  const load = () => photosFor(show.id).then(setPhotos).catch(() => setPhotos([]));
  const { tick, status } = useStore(photoSync);
  useEffect(() => { load(); }, [show.id, tick]);
  const kept = status === 'synced' ? 'They are copied to your other devices.' : 'They stay on this device.';

  // Pictures live in the device's storage; each needs a temporary address to be shown.
  useEffect(() => {
    const made: Record<string, string> = {};
    for (const p of photos) made[p.id] = URL.createObjectURL(p.blob);
    setUrls(made);
    return () => Object.values(made).forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const n = await addPhotos(show.id, [...files]);
      if (n) {
        markShow(show);
        toast(`${n} picture${n === 1 ? '' : 's'} added`);
      } else toast('Those files aren’t pictures.');
    } catch {
      toast('Couldn’t save the pictures on this device.');
    }
    if (input.current) input.current.value = '';
    load();
  };

  const label = `${show.artist.name} · ${longDate(show.date)}`;
  const pictures: Picture[] = photos.filter((p) => urls[p.id]).map((p) => ({ thumb: urls[p.id], full: urls[p.id], label, source: status === 'synced' ? 'your pictures, shared with your other devices' : 'your pictures, kept on this device' }));

  return (
    <>
      {!editing && <Gallery title="Your pictures" pictures={pictures} />}
      <section className="about">
        {(editing || !pictures.length) && <h2>Your pictures</h2>}
        {editing && (
          <div className="photo-edit">
            {photos.map((p) => (
              <span key={p.id} className="photo-thumb">
                {urls[p.id] && <img src={urls[p.id]} alt="" />}
                <button onClick={() => removePhoto(p.id).then(load)} aria-label="Remove picture">✕</button>
              </span>
            ))}
          </div>
        )}
        {!pictures.length && <p className="facts">Add your own photos from the night. {kept}</p>}
        <div className="setting-actions">
          <button className="btn btn-small" onClick={() => input.current?.click()}>Add pictures</button>
          {photos.length > 0 && <button className="btn btn-small btn-quiet" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Remove some'}</button>}
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
      </section>
    </>
  );
}

/** One concert: where and when, what was played, recordings of the night, your pictures and notes. */
export function ShowView({ id }: { id: string }) {
  const { data: show, loading, error } = useData(`show:${id}`, () => showById(id).then((v) => v ?? false));
  const there = useStore(myShows).shows.some((s) => s.id === id);

  if (!show) {
    return (
      <div className="page">
        <Head title="Show" />
        <p className="fineprint">{loading ? 'Loading…' : error instanceof ShowsNotConfigured ? NOT_SET_UP : 'This show couldn’t be loaded.'}</p>
      </div>
    );
  }
  const openArtist = async () => {
    const a = await findOnSpotify(show.artist.name).catch(() => null);
    if (a) go(`/artist/${a.id}`);
    else toast(`${show.artist.name} wasn’t found on Spotify.`);
  };
  return (
    <div className="page">
      <Head kicker={longDate(show.date)} title={show.artist.name} />
      <section className="about show-about">
        <p className="show-where">{placeLine(show)}</p>
        {show.tour && <p className="facts">{show.tour}</p>}
        {show.info && <p className="facts">{show.info}</p>}
        <div className="setting-actions">
          <button className={`btn btn-small ${there ? '' : 'btn-primary'}`} onClick={() => (there ? unmarkShow(id) : markShow(show))} aria-pressed={there}>{there ? '✓ I was there' : 'I was there'}</button>
          <button className="btn btn-small" onClick={openArtist}>Artist page</button>
          {show.artist.mbid !== 'demo' && <button className="btn btn-small" onClick={() => go(`/gigs/${show.artist.mbid}`)}>More shows</button>}
        </div>
      </section>
      <Setlist show={show} />
      <Videos query={recordingQuery(show)} title="Recordings of this show" />
      <MyPhotos show={show} />
      <NotesSection subject={{ subject_uri: showUri(show.id), parent_uri: null, title: `${show.artist.name} · ${longDate(show.date)}`, subtitle: placeLine(show), image: null }} />
      {show.url && <p className="fineprint">Setlist from <a href={show.url} target="_blank" rel="noreferrer">setlist.fm</a>, written by fans. Open it there to correct or add songs.</p>}
    </div>
  );
}

/** Every show an artist has played, newest first, with a jump to any year. */
export function ArtistShowsView({ mbid }: { mbid: string }) {
  const [year, setYear] = useState('');
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState<ShowSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const first = useData(`gigs:${mbid}:${year}`, () => artistShows(mbid, 1, year).then((v) => v ?? false));
  const thisYear = new Date().getFullYear();

  const pickYear = (y: string) => {
    setYear(y);
    setPages(1);
    setMore([]);
  };
  const loadMore = async () => {
    setBusy(true);
    const next = await artistShows(mbid, pages + 1, year).catch(() => null);
    if (next) setMore([...more, ...next.shows]);
    setPages(pages + 1);
    setBusy(false);
  };

  const shows = first.data ? [...first.data.shows, ...more] : [];
  const total = first.data ? first.data.total : 0;
  const name = shows[0]?.artist.name;
  return (
    <div className="page">
      <Head kicker="Past shows" title={name || 'Shows'} />
      <div className="show-filter">
        <label htmlFor="show-year">Year</label>
        <select id="show-year" value={year} onChange={(e) => pickYear(e.target.value)}>
          <option value="">All years</option>
          {Array.from({ length: thisYear - 1949 }, (_, i) => String(thisYear - i)).map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {first.data && <span className="row-sub">{total.toLocaleString()} show{total === 1 ? '' : 's'}</span>}
      </div>
      {first.loading && !first.data && <p className="fineprint">Loading…</p>}
      {first.error instanceof ShowsNotConfigured && <p className="fineprint">{NOT_SET_UP}</p>}
      {first.data === false && <p className="fineprint">{year ? `No shows listed for ${year}.` : 'No shows listed for this artist.'}</p>}
      {groupByYear(shows).map((g) => (
        <section key={g.title} className="show-group">
          {!year && <h2>{g.title}</h2>}
          <div className="show-list">{g.shows.map((s) => <ShowRow key={s.id} show={s} />)}</div>
        </section>
      ))}
      {shows.length > 0 && shows.length < total && <button className="btn show-more" onClick={loadMore} disabled={busy}>{busy ? 'Loading…' : 'Load more'}</button>}
      {shows.length > 0 && <p className="fineprint">From setlist.fm.</p>}
    </div>
  );
}

/** The concerts you've marked, by date or by band, with which ones have your notes and pictures. */
export function MyShowsView() {
  const { shows } = useStore(myShows);
  const allNotes = useStore(notes).notes;
  const photoState = useStore(photoSync);
  const { synced } = useStore(myShows);
  const withPhotos = useData(`shows:withphotos:${photoState.tick}`, showsWithPhotos).data;
  const [by, setBy] = useState<'date' | 'band'>('date');
  const noted = new Set(allNotes.filter((n) => !n.deleted && n.subject_uri.startsWith('setlistfm:show:')).map((n) => n.subject_uri.split(':')[2]));
  const badge = (s: ShowSummary) => [noted.has(s.id) && 'notes', withPhotos?.has(s.id) && 'pictures'].filter(Boolean).join(' + ');
  const groups = by === 'date' ? groupByYear(shows) : groupByBand(shows);
  return (
    <div className="page">
      <Head title="Your concerts" />
      <div className="segments">
        <button className={by === 'date' ? 'on' : ''} onClick={() => setBy('date')}>By date</button>
        <button className={by === 'band' ? 'on' : ''} onClick={() => setBy('band')}>By band</button>
      </div>
      {!shows.length && <p className="fineprint">Nothing here yet. Open an artist, pick one of their past shows and press “I was there”. Your notes and pictures from the night stay with it.</p>}
      {groups.map((g) => (
        <section key={g.title} className="show-group">
          <h2>{g.title}</h2>
          <div className="show-list">{g.shows.map((s) => <ShowRow key={s.id} show={s} showArtist={by === 'date'} badge={badge(s)} />)}</div>
        </section>
      ))}
      {shows.length > 0 && (
        <p className="fineprint">
          {synced !== 'synced'
            ? 'This list and your pictures are kept on this device. Settings → Extras shows how to share them with your other devices.'
            : photoState.status === 'synced'
              ? 'Your concerts, notes and pictures are shared with your other devices.'
              : 'Your concerts and notes are shared with your other devices. Pictures stay on this device until picture storage is added (Settings → Extras).'}
        </p>
      )}
    </div>
  );
}
