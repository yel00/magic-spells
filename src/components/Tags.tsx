import { useState } from 'react';
import { go, pathForUri } from '../lib/router';
import { useStore } from '../lib/store';
import { invalidate } from '../lib/useData';
import * as api from '../spotify/api';
import { commands } from '../state/player';
import { toast } from '../state/ui';
import { normalizeTag, tagCounts, taggedWith, tagsOn, type TagSubject } from '../tags/logic';
import { setTag, tags } from '../tags/store';
import { Art } from './Art';

/** The tags on one album, artist or song, with a field to add more. Suggests tags already in use. */
export function TagEditor({ subject, compact }: { subject: TagSubject; compact?: boolean }) {
  const all = useStore(tags).tags;
  const mine = tagsOn(all, subject.subject_uri);
  const [text, setText] = useState('');
  const typed = normalizeTag(text);
  const suggestions = tagCounts(all).map((t) => t.tag).filter((t) => !mine.includes(t) && (!typed || t.includes(typed))).slice(0, 6);
  const add = (raw: string) => {
    if (setTag(subject, raw, true)) setText('');
  };
  return (
    <div className={`tag-editor ${compact ? 'tag-editor-compact' : ''}`}>
      {!compact && <h2>Your tags</h2>}
      <div className="chips">
        {mine.map((t) => (
          <span key={t} className="chip tag-chip">
            <button onClick={() => go(`/tags/${encodeURIComponent(t)}`)}>{t}</button>
            <button className="tag-x" onClick={() => setTag(subject, t, false)} aria-label={`Remove tag ${t}`}>✕</button>
          </span>
        ))}
        <form className="tag-add" onSubmit={(e) => { e.preventDefault(); add(text); }}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={mine.length ? 'Add another' : 'Add a tag'} aria-label="Add a tag" maxLength={40} autoCapitalize="off" autoCorrect="off" enterKeyHint="done" />
          {typed && <button className="tag-go" aria-label="Add tag">Add</button>}
        </form>
      </div>
      {suggestions.length > 0 && (
        <div className="chips tag-suggest">
          {suggestions.map((t) => <button key={t} className="chip chip-link" onClick={() => add(t)}>+ {t}</button>)}
        </div>
      )}
    </div>
  );
}

const KIND: Record<string, string> = { track: 'Song', album: 'Album', artist: 'Artist', playlist: 'Playlist' };

/** All tags, and the things carrying whichever tags are chosen. Choosing several narrows to things that have all of them. */
export function TagBrowser({ initial }: { initial?: string }) {
  const { tags: all, synced } = useStore(tags);
  const counts = tagCounts(all);
  const [chosen, setChosen] = useState<string[]>(initial && counts.some((c) => c.tag === initial) ? [initial] : []);
  const [busy, setBusy] = useState(false);
  const items = taggedWith(all, chosen);
  const tracks = items.filter((i) => i.subject_uri.startsWith('spotify:track:'));
  const toggle = (t: string) => setChosen((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const name = chosen.join(' + ');

  const save = async () => {
    setBusy(true);
    try {
      const p = await api.createPlaylist(name, `Songs tagged ${name} in Magic Spells.`);
      for (let i = 0; i < tracks.length; i += 100) await api.addToPlaylist(p.id, tracks.slice(i, i + 100).map((t) => t.subject_uri));
      invalidate('library:playlists');
      toast(`Saved “${name}” to your playlists`);
      go(`/playlist/${p.id}`);
    } catch {
      toast('Couldn’t save the playlist.');
    }
    setBusy(false);
  };

  if (!counts.length) {
    return <p className="status">No tags yet. Open any album or artist and add one under “Your tags”, or use the ··· menu on a song.</p>;
  }
  return (
    <div className="tag-browser">
      <div className="chips tag-cloud">
        {counts.map((c) => (
          <button key={c.tag} className={`chip chip-tap ${chosen.includes(c.tag) ? 'chip-on' : ''}`} aria-pressed={chosen.includes(c.tag)} onClick={() => toggle(c.tag)}>
            {c.tag}<span className="chip-count">{c.count}</span>
          </button>
        ))}
      </div>
      <p className="notes-status">
        {synced === 'synced' ? 'Synced across your devices' : synced === 'offline' ? 'Saved on this device — will sync when the connection is back' : synced === 'unconfigured' ? 'Saved on this device only — sync isn’t set up yet' : 'Saved on this device'}
      </p>
      {chosen.length === 0 && <p className="status">Choose a tag. Choose more than one to see what has all of them.</p>}
      {chosen.length > 0 && items.length === 0 && <p className="status">Nothing has {chosen.length > 1 ? 'all of those tags' : 'that tag'}.</p>}
      {tracks.length > 0 && (
        <div className="hero-actions mix-actions tag-actions">
          <button className="btn btn-primary" onClick={() => commands.playTracks(tracks.map((t) => t.subject_uri), 0)}>Play {tracks.length} song{tracks.length === 1 ? '' : 's'}</button>
          <button className="btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save as playlist'}</button>
        </div>
      )}
      <div className="rows">
        {items.map((i) => {
          const kind = i.subject_uri.split(':')[1];
          const path = pathForUri(i.subject_uri);
          return (
            <div className="row" key={i.subject_uri}>
              <button className="row-main" onClick={() => (kind === 'track' ? commands.playTracks([i.subject_uri]) : path && go(path))}>
                <Art images={i.image ? [{ url: i.image }] : null} size={44} round={kind === 'artist'} />
                <span className="row-text"><span className="row-title">{i.title}</span><span className="row-sub">{[KIND[kind], i.subtitle].filter(Boolean).join(' · ')}</span></span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
