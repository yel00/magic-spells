import type { Track } from '../spotify/types';

export interface Seed {
  title: string;
  artist: string;
  album?: string;
  year?: string;
}

/** What the guide returns for one song in the flight. */
export interface Pick {
  title: string;
  artist: string;
  genre: string;
  year: string;
  familiarity: 'well known' | 'deep cut';
  shares: string;
  why: string;
  listen_for: string[];
}

export interface Guide {
  title: string;
  summary: string;
  shared: { feature: string; description: string }[];
  picks: Pick[];
}

/** A pick once it has been found on Spotify. */
export interface Pour extends Pick {
  track: Track;
}

export interface Session {
  id: string;
  at: number;
  title: string;
  summary: string;
  shared: Guide['shared'];
  seeds: Seed[];
  pours: Pour[];
  /** The listener's own notes on the session as a whole. */
  notes: string;
  /** Set once the flight has been saved as a Spotify playlist. */
  playlistId?: string;
}
