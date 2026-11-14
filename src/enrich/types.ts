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

export interface ArtistInfo {
  bio?: Summary;
  facts: string[];
  genres: string[];
  links: Link[];
}

export interface Person {
  name: string;
  detail?: string;
}

export interface CreditGroup {
  title: string;
  people: Person[];
}

export interface AlbumInfo {
  about?: Summary;
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
