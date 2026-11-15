export interface Summary {
  text: string;
  url: string;
  source: string;
  image?: string;
}

export interface Link {
  label: string;
  url: string;
}

/** Another artist this one is tied to: a band member, or a band they belong to. */
export interface Related {
  name: string;
  mbid: string;
  detail?: string;
}

export interface ArtistInfo {
  /** MusicBrainz id: lets other open sources (ListenBrainz) identify the artist exactly. */
  mbid?: string;
  name?: string;
  /** Discogs id, when MusicBrainz links one: the key to everything this person is credited on. */
  discogsId?: string;
  members?: Related[];
  memberOf?: Related[];
  bio?: Summary;
  facts: string[];
  genres: string[];
  links: Link[];
}

export interface Person {
  name: string;
  detail?: string;
  /** MusicBrainz id, so the name can link to that person's page. */
  mbid?: string;
}

export interface CreditGroup {
  title: string;
  people: Person[];
}

export interface AlbumInfo {
  about?: Summary;
  /** Record label, so it can link to the label's page. */
  label?: string;
  facts: string[];
  credits: CreditGroup[];
  links: Link[];
}

export interface RelatedSongs {
  label: string;
  songs: { title: string; artist: string; url: string }[];
}

export interface SongInfo {
  url: string;
  title: string;
  artist: string;
  description?: string;
  released?: string;
  writers: string[];
  producers: string[];
  related: RelatedSongs[];
}
