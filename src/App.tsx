import { useEffect, useLayoutEffect, useRef } from 'react';
import { DevicesSheet } from './components/DevicesSheet';
import { MixSheet, VideoSheet } from './components/Discover';
import { DiscoverIcon, HomeIcon, LibraryIcon, NotesIcon, SearchIcon } from './components/Icons';
import { PictureViewer } from './components/Gallery';
import { LyricsSheet } from './components/LyricsSheet';
import { MiniPlayer } from './components/MiniPlayer';
import { NoteEditor } from './components/Notes';
import { NowPlaying } from './components/NowPlaying';
import { QueueSheet } from './components/QueueSheet';
import { Sheet } from './components/Sheet';
import { SongInfoSheet } from './components/SongInfoSheet';
import { TrackActions } from './components/TrackActions';
import { go, useRoute } from './lib/router';
import { concerts, newCount, scan as scanConcerts } from './concerts/store';
import { useStore } from './lib/store';
import { useData } from './lib/useData';
import { openNotes } from './notes/store';
import { openTags } from './tags/store';
import { TagEditor } from './components/Tags';
import { TagsView } from './views/TagsView';
import { TastingView } from './views/TastingView';
import { openTastings } from './tasting/store';
import * as api from './spotify/api';
import { startPolling, stopPolling } from './state/player';
import { openSheet, ui } from './state/ui';
import { BrowseView } from './views/BrowseView';
import { ConcertsView } from './views/ConcertsView';
import { AlbumView, ArtistView, PlaylistView } from './views/Detail';
import { DiscoverView } from './views/DiscoverView';
import { GenreMapView } from './views/GenreMapView';
import { Home } from './views/Home';
import { Library } from './views/Library';
import { ArtistMapView, LibraryMapView } from './views/MapView';
import { NotesView } from './views/NotesView';
import { PersonView } from './views/PersonView';
import { Search } from './views/Search';
import { Settings } from './views/Settings';
import { TabPlayerView } from './views/TabPlayerView';
import { ToolsView } from './views/ToolsView';

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
  const { sheet, actionsFor, infoFor, noteDraft, tagsFor, lyrics, mix, video, toast } = useStore(ui);
  const me = useData('me', api.me);
  const userId = me.data?.id;
  const fresh = newCount(useStore(concerts));
  const main = useRef<HTMLElement>(null);
  const key = `${route.name}/${route.id || ''}`;

  useEffect(() => {
    startPolling();
    return stopPolling;
  }, []);

  useEffect(() => {
    if (!userId) return;
    openNotes(userId);
    openTags(userId);
    openTastings(userId);
    // Quietly re-check for concerts, at most once a day.
    scanConcerts();
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
  else if (route.name === 'concerts') view = <ConcertsView />;
  else if (route.name === 'person' && route.id) view = <PersonView key={route.id} id={route.id} />;
  else if ((route.name === 'label' || route.name === 'genre') && route.id) view = <BrowseView key={key} kind={route.name} name={route.id} />;
  else if (route.name === 'map') view = route.id ? <ArtistMapView key={route.id} name={route.id} /> : <LibraryMapView />;
  else if (route.name === 'genres') view = <GenreMapView start={route.id} />;
  else if (route.name === 'tags') view = <TagsView key={route.id || ''} tag={route.id} />;
  else if (route.name === 'tasting') view = <TastingView key={route.id || ''} id={route.id} />;
  else if (route.name === 'tools') view = <ToolsView />;
  else if (route.name === 'tab' && route.id) view = <TabPlayerView id={route.id} />;
  else if (route.name === 'settings') view = <Settings />;
  else view = <Home />;

  const activeTab = route.name === 'tags' ? 'library' : ['concerts', 'map', 'genres', 'tasting'].includes(route.name) ? 'discover' : TABS.some((t) => t.name === route.name) ? route.name : null;

  return (
    <div className="app">
      <nav className="tabs" aria-label="Main">
        <span className="brand">Magic Spells</span>
        {TABS.map(({ name, label, Icon }) => (
          <button key={name} className={activeTab === name ? 'on' : ''} aria-current={activeTab === name ? 'page' : undefined} onClick={() => go(`/${name}`)}>
            <span className="tab-icon"><Icon size={24} />{name === 'discover' && fresh > 0 && <span className="tab-badge" aria-label={`${fresh} new concerts`}>{fresh}</span>}</span>
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

      <Sheet open={!!tagsFor} onClose={() => ui.set({ tagsFor: null })} title="Tags">
        {tagsFor && (
          <div className="tag-sheet">
            <p className="facts">{tagsFor.title}{tagsFor.subtitle ? ` · ${tagsFor.subtitle}` : ''}</p>
            <TagEditor subject={tagsFor} compact />
          </div>
        )}
      </Sheet>
      <Sheet open={lyrics} onClose={() => ui.set({ lyrics: false })} title="Lyrics">
        {lyrics && <LyricsSheet />}
      </Sheet>
      <Sheet open={!!mix} onClose={() => ui.set({ mix: null })} title={mix?.kind === 'artist' ? `${mix.seed} mix` : mix?.kind === 'names' ? mix.title : 'New to you'}>
        {mix && <MixSheet key={mix.kind === 'artist' ? mix.seed : mix.kind} request={mix} />}
      </Sheet>
      <Sheet open={!!video} onClose={() => ui.set({ video: null })} title="Video">
        {video && <VideoSheet video={video} />}
      </Sheet>

      <PictureViewer />

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}
