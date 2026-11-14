import { useEffect, useState } from 'react';
import { names } from '../lib/format';
import { go } from '../lib/router';
import { invalidate, useData } from '../lib/useData';
import * as api from '../spotify/api';
import type { Track } from '../spotify/types';
import { commands } from '../state/player';
import { openSheet, toast, ui } from '../state/ui';
import { Art } from './Art';

export function TrackActions({ track }: { track: Track }) {
  const [mode, setMode] = useState<'menu' | 'playlists'>('menu');
  const [liked, setLiked] = useState<boolean | null>(null);
  const close = () => ui.set({ actionsFor: null });

  useEffect(() => {
    let live = true;
    api.libraryContains([track.uri]).then((r) => live && setLiked(!!r[0]));
    return () => {
      live = false;
    };
  }, [track.uri]);

  const nav = (path: string) => {
    close();
    openSheet('none');
    go(path);
  };

  const toggleLike = async () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    try {
      await (nextLiked ? api.saveToLibrary([track.uri]) : api.removeFromLibrary([track.uri]));
      invalidate('library:tracks');
      toast(nextLiked ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    } catch {
      setLiked(!nextLiked);
      toast('Couldn’t update your library.');
    }
    close();
  };

  return (
    <div className="actions">
      <div className="row row-static actions-head">
        <Art images={track.album?.images} size={44} />
        <span className="row-text"><span className="row-title">{track.name}</span><span className="row-sub">{names(track.artists)}</span></span>
      </div>
      {mode === 'menu' ? (
        <>
          <button className="action" onClick={() => { commands.queue(track.uri, track.name); close(); }}>Add to queue</button>
          <button className="action" onClick={() => setMode('playlists')}>Add to playlist…</button>
          <button className="action" onClick={toggleLike} disabled={liked === null}>
            {liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
          </button>
          <button className="action" onClick={() => ui.set({ actionsFor: null, infoFor: track })}>About this song</button>
          {track.album && <button className="action" onClick={() => nav(`/album/${track.album!.id}`)}>Go to album</button>}
          {track.artists[0] && <button className="action" onClick={() => nav(`/artist/${track.artists[0].id}`)}>Go to artist</button>}
        </>
      ) : (
        <PlaylistPicker track={track} onDone={close} />
      )}
    </div>
  );
}

function PlaylistPicker({ track, onDone }: { track: Track; onDone: () => void }) {
  const meData = useData('me', api.me);
  const lists = useData('library:playlists', api.myPlaylists);
  const [name, setName] = useState('');
  const mine = (lists.data?.items || []).filter((p) => p && (p.owner.id === meData.data?.id || p.collaborative));

  const add = async (id: string, label: string) => {
    try {
      await api.addToPlaylist(id, [track.uri]);
      invalidate(`playlist:${id}`);
      invalidate('library:playlists');
      toast(`Added to ${label}`);
    } catch {
      toast('Couldn’t add to that playlist.');
    }
    onDone();
  };

  const create = async () => {
    const label = name.trim();
    if (!label) return;
    try {
      const p = await api.createPlaylist(label);
      await add(p.id, label);
    } catch {
      toast('Couldn’t create the playlist.');
      onDone();
    }
  };

  return (
    <>
      <form className="new-playlist" onSubmit={(e) => { e.preventDefault(); create(); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New playlist name" aria-label="New playlist name" />
        <button className="btn" disabled={!name.trim()}>Create</button>
      </form>
      <div className="actions-list">
        {lists.loading && <div className="status"><span className="spinner" /></div>}
        {mine.map((p) => (
          <button className="action action-art" key={p.id} onClick={() => add(p.id, p.name)}>
            <Art images={p.images} size={36} />
            <span>{p.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
