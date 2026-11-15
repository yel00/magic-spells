# Third-party software and data

Magic Spells is released under the MIT License (see `LICENSE`). It builds on
the following, each under its own terms.

## Bundled or loaded by the app

| What | Used for | Licence |
|---|---|---|
| [React](https://react.dev) | The interface | MIT |
| [alphaTab](https://alphatab.net) | Rendering and playing tab files | MPL-2.0 |
| Bravura music font (ships with alphaTab) | Music notation glyphs | SIL Open Font License 1.1 |
| Sonivox sound font (ships with alphaTab) | Instrument sounds for tab playback | See `soundfont/LICENSE` in alphaTab |
| [Capacitor](https://capacitorjs.com) | The iPhone/iPad shell | MIT |
| [node-postgres](https://node-postgres.com) | Notes and tags sync | MIT |
| `public/genres.json` | The genre map | Derived from [Wikidata](https://www.wikidata.org), CC0 |

## Services the app reads from at run time

The app does not include data from these services; each copy of the app
fetches it on the user's behalf, and each service's terms apply to that use.

| Service | Used for |
|---|---|
| Spotify Web API | Playback control, library, search. Subject to the Spotify Developer Terms; each deployment needs its own Spotify app. |
| MusicBrainz, ListenBrainz, AcousticBrainz | Credits, band members, similar artists, recordings, tempo and key |
| Wikipedia, Wikidata | Biographies, album background and reception (text is CC BY-SA; shown with a link to the article) |
| Discogs API | What a person is credited on |
| Genius API | Song background (needs your own key) |
| Last.fm API | Similar artists (needs your own key) |
| YouTube Data API | Live performances (needs your own key) |
| Ticketmaster Discovery API | Concert listings (needs your own key) |
| LRCLIB | Lyrics. Community-contributed, not a licensed lyrics provider. |
| Songsterr | Finding a song's tab page. Uses a search address that Songsterr does not document for outside use; if it stops working the app falls back to plain search links. |
| Open-Meteo geocoding | Turning a city name into a location |

Magic Spells is not affiliated with or endorsed by Spotify or any service
listed here. If you run or redistribute it, you are responsible for following
their terms.
