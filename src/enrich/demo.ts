// Invented background for the invented demo library, so the "about" sections
// can be seen without a Spotify account. None of this describes real people.
import type { Credits } from './discogs';
import type { AlbumInfo, ArtistInfo, SongInfo } from './types';

const PLAYERS = ['Ines Calloway', 'Tobias Reyne', 'Mara Ostrand', 'Dev Halloran', 'Sunniva Brandt', 'Eli Marchetti'];
const pick = (seed: string, n: number) => PLAYERS[(seed.length + n) % PLAYERS.length];

export function demoArtistInfo(name: string): ArtistInfo {
  const band = !PLAYERS.includes(name);
  return {
    name,
    mbid: `demo-${name}`,
    members: band ? [0, 1, 2].map((n) => ({ name: pick(name, n), mbid: `demo-${pick(name, n)}`, detail: ['vocals, guitar', 'bass', 'drums'][n] })) : [],
    memberOf: band ? [] : [{ name: 'The Slow Tide', mbid: 'demo-The Slow Tide', detail: '2014–' }],
    bio: {
      text: `${name} is a fictional act that exists only in this demo. In a real library this paragraph is the artist's biography from Wikipedia: where they came from, who is in the line-up, and the records that made their name. It is matched through MusicBrainz so that two artists who share a name are not confused.`,
      url: 'https://en.wikipedia.org/wiki/Main_Page',
      source: 'Demo text',
    },
    facts: band ? [`Formed ${2001 + (name.length % 15)}`, 'Demo City', 'Group'] : [`Born ${1970 + (name.length % 20)}`, 'Demo City'],
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
    label: 'Lantern House Records',
    facts: ['Lantern House Records', 'Cat. LHR-0' + (10 + (name.length % 80)), 'First released ' + (2008 + (name.length % 17))],
    credits: [
      { title: 'Performers', people: [{ name: pick(name, 0), mbid: `demo-${pick(name, 0)}`, detail: 'vocals, guitar' }, { name: pick(name, 1), mbid: `demo-${pick(name, 1)}`, detail: 'bass' }, { name: pick(name, 2), mbid: `demo-${pick(name, 2)}`, detail: 'drums, percussion' }, { name: pick(name, 3), mbid: `demo-${pick(name, 3)}`, detail: 'piano, synthesizer' }] },
      { title: 'Written by', people: [{ name: pick(name, 0), mbid: `demo-${pick(name, 0)}` }, { name: pick(name, 3), mbid: `demo-${pick(name, 3)}` }] },
      { title: 'Produced by', people: [{ name: pick(name, 4), mbid: `demo-${pick(name, 4)}` }] },
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
    related: [
      { label: 'Samples', songs: [{ title: 'Marigold', artist: 'Odessa Park', url: 'https://genius.com' }] },
      { label: 'Interpolates', songs: [{ title: 'Blue Hour', artist: 'Glass Orchard', url: 'https://genius.com' }, { title: 'A Riff From Somewhere Else', artist: 'Nobody', url: 'https://genius.com' }] },
      { label: 'Sampled in', songs: [{ title: 'Signal Fire', artist: 'Night Ferry', url: 'https://genius.com' }] },
      { label: 'Covered by', songs: [{ title, artist: 'Another Demo Band', url: 'https://genius.com' }] },
    ],
  };
}

const DEMO_ALBUMS: [string, string][] = [['Small Hours', 'The Slow Tide'], ['Harbor Lights', 'Paper Lanterns'], ['Winter Garden', 'Glass Orchard'], ['Afterglow', 'Night Ferry'], ['Field Notes', 'Marlowe Finch'], ['Northbound', 'The Slow Tide']];

export function demoCredits(name: string): Credits {
  const at = name.length % DEMO_ALBUMS.length;
  const take = (n: number, count: number) => Array.from({ length: count }, (_, i) => DEMO_ALBUMS[(at + n + i) % DEMO_ALBUMS.length]).map(([title, artist], i) => ({ title, artist, year: 2021 - i * 2 }));
  return { total: 7, groups: [{ role: 'Produced', works: take(0, 3) }, { role: 'Appears on', works: take(3, 3) }, { role: 'Engineer', works: [{ title: 'A Record Not On Spotify', artist: 'Nobody', year: 2009 }] }] };
}
