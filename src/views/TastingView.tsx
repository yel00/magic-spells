import { useEffect, useState } from 'react';
import { Art } from '../components/Art';
import { ChevronLeft, HeartIcon, PlayIcon } from '../components/Icons';
import { Status } from '../components/Shelf';
import { names } from '../lib/format';
import { go } from '../lib/router';
import { useStore } from '../lib/store';
import { invalidate, useData } from '../lib/useData';
import * as api from '../spotify/api';
import type { Track } from '../spotify/types';
import { commands, player } from '../state/player';
import { toast, ui } from '../state/ui';
import { playlistDescription, seedChoices, seedFrom } from '../tasting/logic';
import { deleteSession, runTasting, TastingError, tastings, updateSession } from '../tasting/store';
import type { Pour, Session } from '../tasting/types';
import { pickImage } from '../components/Art';

function Head({ title, kicker }: { title: string; kicker: string }) {
  return (
    <header className="page-head person-head">
      <button className="icon-btn back-inline" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
      <div className="row-text"><span className="kicker">{kicker}</span><h1>{title}</h1></div>
    </header>
  );
}

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

/** Start a new tasting, or reopen an earlier one. */
function NewTasting() {
  const top = useData('home:topTracks', api.topTracks);
  const recent = useData('home:recent', api.recentlyPlayed);
  const liked = useData('library:tracks', api.savedTracks);
  const past = useStore(tastings).sessions;
  const [chosen, setChosen] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [count, setCount] = useState(4);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<TastingError | null>(null);

  const choices = seedChoices([top.data?.items || [], (recent.data?.items || []).map((h) => h.track), (liked.data?.items || []).map((i) => i.track)]);
  const loading = top.loading && recent.loading && liked.loading;
  const toggle = (uri: string) => setChosen((cur) => (cur.includes(uri) ? cur.filter((u) => u !== uri) : cur.length >= 6 ? cur : [...cur, uri]));

  const start = async () => {
    setError(null);
    const seeds = choices.filter((t) => chosen.includes(t.uri)).map(seedFrom);
    try {
      const session = await runTasting(seeds, note.trim(), count, setStep);
      go(`/tasting/${session.id}`);
    } catch (e) {
      setError(e instanceof TastingError ? e : new TastingError('The session couldn’t be run. Please try again.'));
    }
    setStep(null);
  };

  return (
    <div className="page">
      <Head kicker="Discover" title="Tasting session" />
      <section className="about">
        <p className="facts">
          Pick a few songs you like. The guide works out what they have in common as sound, then pours a flight of songs from very different genres that share it, and tells you what to listen for.
        </p>
      </section>

      {step ? (
        <div className="mix-building map-building">
          <p>{step}</p>
          <div className="bar bar-busy"><span /></div>
          <p className="facts">This takes about half a minute.</p>
        </div>
      ) : (
        <>
          <section className="about">
            <h2>Start from {chosen.length ? `${chosen.length} song${chosen.length === 1 ? '' : 's'}` : 'songs you like'}</h2>
            <Status loading={loading} empty={!loading && !choices.length && 'Play or like some songs first, so there is something to start from.'} />
            <div className="seed-list">
              {choices.map((t) => (
                <button key={t.uri} className={`seed ${chosen.includes(t.uri) ? 'seed-on' : ''}`} aria-pressed={chosen.includes(t.uri)} onClick={() => toggle(t.uri)}>
                  <Art images={t.album?.images} size={40} />
                  <span className="row-text"><span className="row-title">{t.name}</span><span className="row-sub">{names(t.artists)}</span></span>
                  <span className="seed-tick">{chosen.includes(t.uri) ? '✓' : ''}</span>
                </button>
              ))}
            </div>
            {choices.length > 0 && (
              <>
                <label className="tasting-note">
                  Anything in particular you love about them? (optional)
                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} placeholder="e.g. the bass lines, how they build" />
                </label>
                <div className="segments radius" role="radiogroup" aria-label="How many songs in the flight">
                  {[3, 4, 5].map((n) => <button key={n} role="radio" aria-checked={count === n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>{n} songs</button>)}
                </div>
                {error && <p className="error" role="alert">{error.message}</p>}
                <button className="btn btn-primary" onClick={start} disabled={!chosen.length}>{chosen.length ? 'Pour the flight' : 'Choose 1 to 6 songs'}</button>
              </>
            )}
          </section>

          {past.length > 0 && (
            <section className="about">
              <h2>Earlier sessions</h2>
              <div className="versions">
                {past.map((s) => (
                  <button key={s.id} className="version" onClick={() => go(`/tasting/${s.id}`)}>
                    <Art images={s.pours[0]?.track.album?.images} size={44} />
                    <span className="row-text"><span className="row-title">{s.title}</span><span className="row-sub">{day(s.at)} · {s.pours.length} songs · from {s.seeds[0]?.title}{s.seeds.length > 1 ? ` +${s.seeds.length - 1}` : ''}</span></span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function PourCard({ pour, index }: { pour: Pour; index: number }) {
  const t = pour.track;
  const playing = useStore(player).playback?.item?.uri === t.uri;
  const [liked, setLiked] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    api.libraryContains([t.uri]).then((r) => live && setLiked(!!r[0]));
    return () => {
      live = false;
    };
  }, [t.uri]);
  const toggleLike = async () => {
    const want = !liked;
    setLiked(want);
    try {
      await (want ? api.saveToLibrary([t.uri]) : api.removeFromLibrary([t.uri]));
      invalidate('library:tracks');
      toast(want ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    } catch {
      setLiked(!want);
      toast('Couldn’t update your library.');
    }
  };
  const subject = { subject_uri: t.uri, parent_uri: t.album?.uri || null, title: t.name, subtitle: names(t.artists), image: pickImage(t.album?.images, 150) || null };
  return (
    <article className={`pour ${playing ? 'pour-playing' : ''}`}>
      <div className="pour-head">
        <span className="pour-number">{index + 1}</span>
        <Art images={t.album?.images} size={64} />
        <span className="row-text">
          <span className="row-title">{t.name}</span>
          <span className="row-sub">{names(t.artists)}</span>
          <span className="pour-tags">{[pour.genre, pour.year, pour.familiarity].filter(Boolean).join(' · ')}</span>
        </span>
      </div>
      <p className="pour-shares">{pour.shares}</p>
      <p className="pour-why">{pour.why}</p>
      <h3>Listen for</h3>
      <ul className="pour-listen">{pour.listen_for.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <div className="pour-actions">
        <button className="btn btn-primary btn-small" onClick={() => commands.playTracks([t.uri])}><PlayIcon size={16} /> Play</button>
        <button className={`icon-btn ${liked ? 'on' : ''}`} onClick={toggleLike} disabled={liked === null} aria-pressed={!!liked} aria-label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}><HeartIcon filled={!!liked} /></button>
        <button className="btn btn-small" onClick={() => ui.set({ noteDraft: { subject, body: '' } })}>Add note</button>
        <button className="btn btn-quiet btn-small" onClick={() => ui.set({ infoFor: t })}>About</button>
      </div>
    </article>
  );
}

function SessionPage({ session }: { session: Session }) {
  const [notes, setNotes] = useState(session.notes);
  const [busy, setBusy] = useState(false);
  const uris = session.pours.map((p) => p.track.uri);

  const savePlaylist = async () => {
    setBusy(true);
    try {
      const p = await api.createPlaylist(`Tasting: ${session.title}`, playlistDescription(session.summary, session.seeds));
      await api.addToPlaylist(p.id, uris);
      invalidate('library:playlists');
      updateSession(session.id, { playlistId: p.id });
      toast('Saved to your Spotify playlists');
    } catch {
      toast('Couldn’t save the playlist.');
    }
    setBusy(false);
  };
  const remove = () => {
    if (!window.confirm('Delete this session? Any playlist you saved from it stays in Spotify.')) return;
    deleteSession(session.id);
    go('/tasting');
  };

  return (
    <div className="page">
      <Head kicker={`Tasting · ${day(session.at)}`} title={session.title} />
      <section className="about">
        <p className="prose tasting-summary">{session.summary}</p>
        <p className="facts">Poured from {session.seeds.map((s) => `“${s.title}” (${s.artist})`).join(', ')}.</p>
        <div className="hero-actions mix-actions">
          <button className="btn btn-primary" onClick={() => commands.playTracks(uris, 0)}><PlayIcon size={18} /> Play the flight</button>
          {session.playlistId
            ? <button className="btn" onClick={() => go(`/playlist/${session.playlistId}`)}>Open playlist</button>
            : <button className="btn" onClick={savePlaylist} disabled={busy}>{busy ? 'Saving…' : 'Save as playlist'}</button>}
        </div>
        {session.playlistId && <p className="facts">Saved as a Spotify playlist. Share it from Spotify like any other.</p>}
      </section>

      <section className="about">
        <h2>What your songs share</h2>
        <div className="shared">
          {session.shared.map((f) => (
            <div key={f.feature} className="shared-card"><strong>{f.feature}</strong><p>{f.description}</p></div>
          ))}
        </div>
      </section>

      <section className="about">
        <h2>The flight</h2>
        <div className="pours">{session.pours.map((p, i) => <PourCard key={p.track.uri} pour={p} index={i} />)}</div>
      </section>

      <section className="about">
        <h2>Your notes on this session</h2>
        <textarea className="tasting-notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== session.notes && updateSession(session.id, { notes })} placeholder="What surprised you? What would you pour again?" rows={4} maxLength={4000} />
        <p className="fineprint flush">
          Chosen and described by an AI guide (Claude), then checked against Spotify. It can be wrong about details, so trust your ears. Session notes are kept on this device; notes on individual songs sync with your other notes.
        </p>
        <button className="btn btn-quiet btn-danger tasting-delete" onClick={remove}>Delete session</button>
      </section>
    </div>
  );
}

export function TastingView({ id }: { id?: string }) {
  const session = useStore(tastings).sessions.find((s) => s.id === id);
  if (!id) return <NewTasting />;
  if (!session) return <div className="page"><Head kicker="Tasting" title="Not found" /><p className="status">That session isn’t on this device.</p></div>;
  return <SessionPage key={session.id} session={session} />;
}

export type { Track };
