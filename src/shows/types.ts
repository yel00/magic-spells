export interface SetSong {
  name: string;
  info?: string;
  /** The original artist, when the song is a cover. */
  cover?: string;
  guest?: string;
  /** Played from tape rather than performed. */
  tape?: boolean;
}

export interface ShowSet {
  name: string;
  songs: SetSong[];
}

/** A past concert, without its songs. */
export interface ShowSummary {
  id: string;
  /** Year-month-day; empty when unknown. */
  date: string;
  artist: { name: string; mbid: string };
  venue: string;
  city: string;
  region: string;
  country: string;
  tour: string;
  info: string;
  url: string;
  songCount: number;
}

export interface Show extends ShowSummary {
  sets: ShowSet[];
}

export interface ShowPage {
  shows: ShowSummary[];
  page: number;
  perPage: number;
  total: number;
}
