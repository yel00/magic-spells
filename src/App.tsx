import { useEffect, useLayoutEffect, useRef } from 'react';
import { DevicesSheet } from './components/DevicesSheet';
import { HomeIcon, LibraryIcon, SearchIcon } from './components/Icons';
import { MiniPlayer } from './components/MiniPlayer';
import { NowPlaying } from './components/NowPlaying';
import { QueueSheet } from './components/QueueSheet';
import { Sheet } from './components/Sheet';
import { TrackActions } from './components/TrackActions';
import { go, useRoute } from './lib/router';
import { useStore } from './lib/store';
import { startPolling, stopPolling } from './state/player';
import { openSheet, ui } from './state/ui';
import { AlbumView, ArtistView, PlaylistView } from './views/Detail';
import { Home } from './views/Home';
import { Library } from './views/Library';
import { Search } from './views/Search';
import { Settings } from './views/Settings';

const TABS = [
  { name: 'home', label: 'Home', Icon: HomeIcon },
  { name: 'search', label: 'Search', Icon: SearchIcon },
  { name: 'library', label: 'Library', Icon: LibraryIcon },
];

const scrollMemory = new Map<string, number>();

export function App() {
  const route = useRoute();
  const { sheet, actionsFor, toast } = useStore(ui);
  const main = useRef<HTMLElement>(null);
  const key = `${route.name}/${route.id || ''}`;

  useEffect(() => {
    startPolling();
    return stopPolling;
  }, []);

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

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
