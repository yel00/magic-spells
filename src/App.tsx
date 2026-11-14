import { useEffect, useLayoutEffect, useRef } from 'react';
import { DevicesSheet } from './components/DevicesSheet';
import { MixSheet, VideoSheet } from './components/Discover';
import { DiscoverIcon, HomeIcon, LibraryIcon, NotesIcon, SearchIcon } from './components/Icons';
import { MiniPlayer } from './components/MiniPlayer';
import { NoteEditor } from './components/Notes';
import { NowPlaying } from './components/NowPlaying';
import { QueueSheet } from './components/QueueSheet';
import { Sheet } from './components/Sheet';
import { SongInfoSheet } from './components/SongInfoSheet';
import { TrackActions } from './components/TrackActions';
import { go, useRoute } from './lib/router';
import { useStore } from './lib/store';
import { useData } from './lib/useData';
import { openNotes } from './notes/store';
import * as api from './spotify/api';
import { startPolling, stopPolling } from './state/player';
import { openSheet, ui } from './state/ui';
import { AlbumView, ArtistView, PlaylistView } from './views/Detail';
import { DiscoverView } from './views/DiscoverView';
import { Home } from './views/Home';
import { Library } from './views/Library';
import { NotesView } from './views/NotesView';
import { Search } from './views/Search';
import { Settings } from './views/Settings';

const TABS = [
  { name: 'home', label: 'Home', Icon: HomeIcon },
  { name: 'search', label: 'Search', Icon: SearchIcon },
  { name: 'library', label: 'Library', Icon: LibraryIcon },
  { name: 'discover', label: 'Discover', Icon: DiscoverIcon },
  { name: 'notes', label: 'Notes', Icon: NotesIcon },
];

const scrollMemory = new Map<string, number>();

export function App() {
  const route = useRoute();
  const { sheet, actionsFor, infoFor, noteDraft, mix, video, toast } = useStore(ui);
  const me = useData('me', api.me);
  const userId = me.data?.id;
  const main = useRef<HTMLElement>(null);
  const key = `${route.name}/${route.id || ''}`;

  useEffect(() => {
    startPolling();
    return stopPolling;
  }, []);

  useEffect(() => {
    if (userId) openNotes(userId);
  }, [userId]);

  // Each page keeps its own scroll position, so going back lands where you were.
  useLayoutEffect(() => {
    const el = main.current;
    if (!el) return;
    el.scrollTop = scrollMemory.get(key) || 0;
  }, [key]);

  let view;
  if (route.name === 'album' && route.id) view = <AlbumView id={route.id} />;
  else if (route.name === 'artist' && route.id) view = <ArtistView id={route.id} />;
  else if (route.name === 'playlist' && route.id) view = <PlaylistView id={route.id} />;
  else if (route.name === 'library') view = <Library />;
  else if (route.name === 'search') view = <Search />;
  else if (route.name === 'notes') view = <NotesView />;
  else if (route.name === 'discover') view = <DiscoverView />;
  else if (route.name === 'settings') view = <Settings />;
  else view = <Home />;

  const activeTab = TABS.some((t) => t.name === route.name) ? route.name : null;

  return (
    <div className="app">
      <nav className="tabs" aria-label="Main">
        <span className="brand">Magic Spells</span>
        {TABS.map(({ name, label, Icon }) => (
          <button key={name} className={activeTab === name ? 'on' : ''} aria-current={activeTab === name ? 'page' : undefined} onClick={() => go(`/${name}`)}>
            <Icon size={24} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <main ref={main} onScroll={(e) => scrollMemory.set(key, e.currentTarget.scrollTop)}>{view}</main>

      <MiniPlayer />

      <Sheet open={sheet === 'now'} onClose={() => openSheet('none')} title="Now playing" full><NowPlaying /></Sheet>
      <Sheet open={sheet === 'queue'} onClose={() => openSheet('now')} title="Queue"><QueueSheet /></Sheet>
      <Sheet open={sheet === 'devices'} onClose={() => openSheet('none')} title="Play on"><DevicesSheet /></Sheet>
      <Sheet open={!!actionsFor} onClose={() => ui.set({ actionsFor: null })} title="Track options">
        {actionsFor && <TrackActions track={actionsFor} />}
      </Sheet>

      <Sheet open={!!infoFor} onClose={() => ui.set({ infoFor: null })} title="About this song">
        {infoFor && <SongInfoSheet track={infoFor} />}
      </Sheet>

      <Sheet open={!!noteDraft} onClose={() => ui.set({ noteDraft: null })} title={noteDraft?.id ? 'Edit note' : 'New note'}>
        {noteDraft && <NoteEditor key={noteDraft.id || noteDraft.subject.subject_uri} />}
      </Sheet>

      <Sheet open={!!mix} onClose={() => ui.set({ mix: null })} title={mix?.kind === 'artist' ? `${mix.seed} mix` : 'New to you'}>
        {mix && <MixSheet key={mix.kind === 'artist' ? mix.seed : 'surprise'} request={mix} />}
      </Sheet>
      <Sheet open={!!video} onClose={() => ui.set({ video: null })} title="Video">
        {video && <VideoSheet video={video} />}
      </Sheet>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
