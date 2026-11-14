// Invented background for the invented demo library, so the "about" sections
// can be seen without a Spotify account. None of this describes real people.
import type { AlbumInfo, ArtistInfo, SongInfo } from './types';

const PLAYERS = ['Ines Calloway', 'Tobias Reyne', 'Mara Ostrand', 'Dev Halloran', 'Sunniva Brandt', 'Eli Marchetti'];
const pick = (seed: string, n: number) => PLAYERS[(seed.length + n) % PLAYERS.length];

export function demoArtistInfo(name: string): ArtistInfo {
  return {
    bio: {
      text: `${name} is a fictional act that exists only in this demo. In a real library this paragraph is the artist's biography from Wikipedia: where they came from, who is in the line-up, and the records that made their name. It is matched through MusicBrainz so that two artists who share a name are not confused.`,
      url: 'https://en.wikipedia.org/wiki/Main_Page',
      source: 'Demo text',
    },
    facts: [`Formed ${2001 + (name.length % 15)}`, 'Demo City', 'Group'],
    genres: [],
    links: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' }, { label: 'Official site', url: 'https://example.com' }],
  };
}

export function demoAlbumInfo(name: string, artist: string): AlbumInfo {
  return {
    about: {
      text: `“${name}” is an invented album by ${artist}. With a real library, this is where the album's story appears: when and where it was recorded, how it was received, and where it sits in the artist's catalogue.`,
      url: 'https://en.wikipedia.org/wiki/Main_Page',
      source: 'Demo text',
    },
    facts: ['Lantern House Records', 'Cat. LHR-0' + (10 + (name.length % 80)), 'First released ' + (2008 + (name.length % 17))],
    credits: [
      { title: 'Performers', people: [{ name: pick(name, 0), detail: 'vocals, guitar' }, { name: pick(name, 1), detail: 'bass' }, { name: pick(name, 2), detail: 'drums, percussion' }, { name: pick(name, 3), detail: 'piano, synthesizer' }] },
      { title: 'Written by', people: [{ name: pick(name, 0) }, { name: pick(name, 3) }] },
      { title: 'Produced by', people: [{ name: pick(name, 4) }] },
      { title: 'Engineering & arrangement', people: [{ name: pick(name, 5), detail: 'recording, mixing' }, { name: pick(name, 4), detail: 'mastering' }] },
    ],
    links: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page' }],
  };
}

export function demoSongInfo(title: string, artist: string): SongInfo {
  return {
    url: 'https://genius.com',
    title,
    artist,
    description: `“${title}” is a made-up song for this demo. With a real library, Genius supplies the story behind the track here: what it is about, how it was written, and what the artist has said about it.`,
    released: 'March 3, 2015',
    writers: [pick(title, 0), pick(title, 3)],
    producers: [pick(title, 4)],
    related: [{ label: 'Covered by', songs: [{ title, artist: 'Another Demo Band', url: 'https://genius.com' }] }],
  };
}
