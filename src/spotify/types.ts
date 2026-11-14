export interface Image {
  url: string;
  width?: number | null;
  height?: number | null;
}

export interface ArtistRef {
  id: string;
  name: string;
  uri: string;
}

export interface Artist extends ArtistRef {
  images?: Image[];
  genres?: string[];
}

export interface AlbumRef {
  id: string;
  name: string;
  uri: string;
  images: Image[];
  artists: ArtistRef[];
  release_date?: string;
  album_type?: string;
  total_tracks?: number;
}

export interface Track {
  id: string;
  name: string;
  uri: string;
  duration_ms: number;
  explicit?: boolean;
  track_number?: number;
  disc_number?: number;
  artists: ArtistRef[];
  album?: AlbumRef;
  type?: string;
}

export interface Paging<T> {
  items: T[];
  next: string | null;
  total?: number;
}

export interface Album extends AlbumRef {
  tracks: Paging<Track>;
  copyrights?: { text: string }[];
  genres?: string[];
}

/** Playlist entries come back as `item` (2026 API) or `track` (older shape). */
export interface PlaylistEntry {
  item?: Track | null;
  track?: Track | null;
  added_at?: string;
}

export interface Playlist {
  id: string;
  name: string;
  uri: string;
  description?: string | null;
  images?: Image[] | null;
  owner: { id: string; display_name?: string | null };
  collaborative?: boolean;
  items?: Partial<Paging<PlaylistEntry>> & { total?: number };
  tracks?: Partial<Paging<PlaylistEntry>> & { total?: number };
}

export interface Device {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted?: boolean;
  volume_percent: number | null;
  supports_volume?: boolean;
}

export interface Context {
  uri: string;
  type: string;
}

export interface PlaybackState {
  device: Device;
  is_playing: boolean;
  progress_ms: number | null;
  item: Track | null;
  shuffle_state: boolean;
  repeat_state: 'off' | 'track' | 'context';
  context: Context | null;
}

export interface Queue {
  currently_playing: Track | null;
  queue: Track[];
}

export interface PlayHistory {
  track: Track;
  played_at: string;
  context: Context | null;
}

export interface Me {
  id: string;
  display_name?: string | null;
  images?: Image[];
}

export interface SearchResult {
  tracks?: Paging<Track>;
  artists?: Paging<Artist>;
  albums?: Paging<AlbumRef>;
  playlists?: Paging<Playlist | null>;
}
