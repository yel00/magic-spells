# Magic Spells

A fast, lightweight remote and browser for Spotify, built for iPhone and iPad.
Think of it as a small Roon for a Spotify account: it controls any Spotify
Connect speaker, shows your library, and (in later phases) adds the context
Spotify leaves out — credits, biographies, lyrics notes, live versions, concerts.

It is an installable web app. Spotify itself plays the audio; this app is the
remote, so nothing here streams or stores music.

## What works today (phases 1–6)

- Sign in with Spotify (no server, no secret — PKCE)
- Now playing: artwork, seek, play/pause/skip, shuffle, repeat, volume
- Spotify Connect: see every available device and move playback between them
- Queue: see what's next, add any track
- Home: jump back in, your playlists, top artists, on repeat lately
- Library: playlists, albums, artists, liked songs
- Search across Spotify
- Album, artist and playlist pages; save albums, follow artists, like songs
- Playlists: create one and add tracks from anywhere; on playlists you own,
  rename, edit the description, reorder and remove tracks, or delete the
  playlist. Long playlists load 50 tracks at a time
- Artist pages: biography (Wikipedia), where and when they started, genres,
  and links to their site, Bandcamp, Discogs, Setlist.fm and more (MusicBrainz)
- Album pages: the album's story (Wikipedia), label and catalogue number, and
  full credits — performers and instruments, writers, producers, engineers
- About this song: background, writers, producers, samples and covers, and a
  link to lyrics and annotations (Genius)
- Listening notes: write notes on any album, artist or song; song notes also
  show on their album; a Notes tab lists and searches everything. Notes save on
  the device instantly and work offline, and sync between your devices once a
  database is connected
- Discovery: similar artists and an artist's popular tracks on every artist
  page; a Discover tab with artists near your favourites that you don't follow
  yet; one-tap mixes built around an artist or from new-to-you artists, which
  can be played straight away or saved as a Spotify playlist
- Live versions: YouTube performances on artist pages and in "About this song",
  playing inside the app (Spotify pauses while a video plays)
- Concerts: choose a city (or use your location) and a distance; the app checks
  whether artists you follow or play a lot have shows nearby, lists them by
  date with ticket links, re-checks once a day when opened, and flags shows
  that are new since you last looked. Artist pages show their nearby dates
- Musician tools (the tuning-fork button on Home, and inside "About this song"):
  - Tempo and key for a song, looked up from open databases, with the Camelot
    code DJs use
  - Listen: the microphone hears the room or your instrument and shows tempo,
    key, and the note being played with how sharp or flat it is
  - Tap tempo
  - Tabs: a direct link to the song's Songsterr tab (with which instruments it
    covers) plus searches on Ultimate Guitar and MuseScore
  - Tab player: import Guitar Pro or MusicXML files, pick the guitar, bass or
    piano part, slow it to 75% or 50%, loop it, add a click; files stay on
    the device
- Cross-links: every name in an album's credits opens that person's page —
  biography, the bands they belong to, and everything they produced, played
  on or mixed, each of which opens on Spotify. Artist pages list band members
  the same way. Record labels and genres are tappable and open everything
  Spotify files under them
- Music maps (Discover tab, and the Map button on artist pages):
  - Similar-artist map: closer means more alike; tap a name to play it, open
    it, re-centre the map on it or start a mix
  - Your music map: the artists you play, follow, like and playlist, sized by
    how much you play them and coloured by neighbourhood, with nearby artists
    you don't have yet marked as recommendations and playable as a mix. A
    playlist can be highlighted on the map
  - Genre map: about 1,400 genres, what each is a kind of and what it grew
    out of, with search and links to Spotify's artists for each genre
- Personal tags on any album, artist or song; browse them under Library →
  Tags, combine several, play the matching songs or save them as a playlist.
  Tags sync between devices alongside notes
- Versions: an artist's remasters and deluxe editions are folded into one
  entry per album, with a Versions list on the album page. "Find every
  version of this song" lists the artist's other takes and covers that
  Spotify has (playable in one tap), then other artists known to have
  recorded it, with "Load more" for heavily covered songs
- Reception on album pages: review scores (the publications' own ratings, and
  Metacritic where recorded) and Wikipedia's account of the reviews, plus
  links to AllMusic, Pitchfork and similar pages where MusicBrainz has them
- Lyrics on Now Playing: time-synced where available, with the current line
  highlighted and tap-to-jump; plain lyrics otherwise
- iPhone layout (tab bar) and iPad layout (sidebar, side-by-side now playing)
- Demo mode with invented music, for looking around without an account

## Set it up

1. **Create a Spotify app** at <https://developer.spotify.com/dashboard>
   (the account must have Premium). Choose "Web API".
2. **Add the redirect URI**: your deployed address with a trailing slash, e.g.
   `https://your-app.vercel.app/`. For local development add `http://127.0.0.1:5173/`
   (Spotify does not accept `localhost`).
3. **Add yourself as a user** under Settings → User Management. Personal apps
   are limited to five named Spotify users.
4. **Deploy**: import this repo into Vercel (it detects Vite; no settings needed).
   Optionally set `VITE_SPOTIFY_CLIENT_ID` so the client ID is baked in;
   otherwise paste it on the welcome screen. The client ID is not a secret.
5. **Turn on song background (optional)**: create an API client at
   <https://genius.com/api-clients>, press "Generate Access Token", and add it
   in Vercel as the environment variable `GENIUS_ACCESS_TOKEN`, then redeploy.
   Without it everything else works and "About this song" says it isn't connected.
6. **Turn on notes sync (optional)**: in the Vercel project, open Storage →
   Create Database → Neon (Postgres, free tier) and connect it to the project.
   That adds `DATABASE_URL` automatically; redeploy. The table is created on
   first use. Without it, notes still work but stay on the device they were
   written on.
7. **Better suggestions (optional)**: discovery works with no key, using
   ListenBrainz. For Last.fm's stronger "people who play X also play Y" data,
   create a key at <https://www.last.fm/api/account/create> and add it in
   Vercel as `LASTFM_API_KEY`.
8. **Videos inside the app (optional)**: in Google Cloud, enable "YouTube Data
   API v3", create an API key, and add it in Vercel as `YOUTUBE_API_KEY`. The
   free allowance is about 100 searches a day; results are cached for a week.
   Without it, the app shows a link that opens the same search on YouTube.
9. **Concerts (optional)**: create a free key at
   <https://developer.ticketmaster.com> and add it in Vercel as
   `TICKETMASTER_API_KEY`. Then open Discover → Concerts near you and pick
   your area.
10. **On the iPhone/iPad**: open the site in Safari → Share → Add to Home Screen.

## iPhone and iPad app

The site can be installed from Safari (Share → Add to Home Screen). To install
it through TestFlight as a native app instead, see
[docs/TESTFLIGHT.md](docs/TESTFLIGHT.md).

## Develop

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # unit tests
npm run test:live  # checks against the real MusicBrainz and Wikipedia (not in CI)
npm run build      # typecheck + production build
```

## Things Spotify decides, not us

- Controlling playback needs Spotify Premium.
- A speaker only appears once Spotify can see it; idle speakers drop off the
  list until something wakes them.
- Spotify has no grouping API. A group made in the Sonos, Google Home or Alexa
  app appears here as a single device and can be controlled as one.
- Track lists are only shared for playlists you own or collaborate on; other
  playlists can still be played.
- Search returns at most ten results per type, and Spotify's own
  recommendations, related artists and tempo/key data are closed to new apps.

## Roadmap

1. ~~Player, devices, queue, library, search~~
2. ~~Rich artist and album pages: Wikipedia, MusicBrainz credits, Genius~~
3. ~~Listening notes, synced between devices~~
4. ~~Discovery (Last.fm / ListenBrainz) and YouTube live versions~~
5. ~~Concert scanner~~ (push notifications for new shows still to do)
6. ~~Musician tools: BPM/key lookup, microphone analyzer, tab search and player~~
7. ~~Native shell for TestFlight~~ (configured; not yet built on a Mac)

### Backlog

- Beatport: a "find on Beatport" link, and full browsing if Beatport grants partner access
- NAS / local files
- Podcasts and audiobooks
- Push notifications for newly announced concerts
- Sonos grouping through Sonos's own control API

## Where the extra information comes from

- **MusicBrainz and Wikipedia** are free and need no key. The app asks them
  directly, at most once a second, and remembers answers on the device for a
  month. An artist is only matched on an exact name, and a Wikipedia article is
  only used when MusicBrainz points to it or it clearly describes music —
  showing nothing is better than showing the wrong person.
- **Genius** needs a key, so the app asks its own small server function
  (`api/genius.js`), which holds the key. Genius does not license lyrics
  through its API; the app shows the song's background and links to the lyrics.

API keys for later phases (YouTube, Ticketmaster) will live on the server the
same way.

## How discovery works

Spotify closed its recommendation, related-artist and top-track endpoints to
new apps, so:

- **Who is similar** comes from Last.fm (if a key is set) or ListenBrainz.
- **An artist's popular tracks** come from a Spotify search limited to that
  artist, which returns results roughly in popularity order.
- **A mix** takes two popular tracks from each of about fourteen similar
  artists, threads three of the seed artist's own through it, and never plays
  the same artist twice in a row. Building one takes a few seconds the first
  time (around fifteen Spotify searches, three at a time) and is cached after.

## How the concert scanner works

It builds a watch list (artists you follow, then your most played, up to 200)
and asks Ticketmaster about each one near your chosen place, three at a time.
A show only counts if the artist is actually on the bill, which filters out
tribute acts. A festival with several of your artists appears once, listing
all of them. Answers are cached for a day, so reopening the app costs nothing.
Your location is rounded to about a kilometre before it leaves the device and
is not stored on the server. Distances are in miles.

It scans when the app is opened, not in the background: a show announced today
appears the next time you open the app. Background push notifications would
need a scheduled server job and are not built yet.

## How cross-linking and lyrics work

- **People.** Album credits come from MusicBrainz, which gives each person a
  permanent id. A person's page combines their MusicBrainz record (biography
  link, band memberships) with their Discogs credits list, which records what
  they did on each release. Discogs needs no key and allows 25 requests a
  minute; the most recent 300 releases are fetched. Tapping a credited album
  looks for it on Spotify by exact title and artist.
- **Labels and genres** are Spotify searches filtered by label or genre, ten
  results at a time.
- **Lyrics** come from [LRCLIB](https://lrclib.net), a free community database.
  Lyrics are only used when they belong to a recording of the same length
  (within three seconds), so a live version's timing is never applied to the
  studio track. LRCLIB is community-sourced, not a licensed lyrics service.

## How the maps and tags work

- **Similarity** comes from Last.fm (if `LASTFM_API_KEY` is set) or
  ListenBrainz. Each artist's list of similar artists carries a score; the
  map treats that score as how strongly two names pull together.
- **Your music map** reads your most-played artists over three time ranges,
  who you follow, your liked songs and the playlists you own, and combines
  them into one weight per artist. The hundred heaviest are drawn. An artist
  you don't have is recommended only if it sits near at least two you do.
  The first build makes about a hundred similarity lookups; the result is
  kept on the device for a week.
- **The genre map** is built from Wikidata, which is free to reuse, by
  `scripts/build-genres.mjs`. The generated file is committed, so the app
  never contacts Wikidata. Wikidata's genre links are incomplete: about half
  the genres have no recognised family and sit uncoloured.
- **Links out**: artist maps link to Music-Map, and genre pages to Cratto and
  Musicmap. None of those sites offers its data for reuse, so they are linked,
  not copied.
- **Tags** are stored like notes: on the device first, then synced through
  `api/notes.js?kind=tags` into a `tags` table created on first use.

## How versions and reviews work

- **Editions** are grouped by title once edition wording is removed ("Deluxe
  Edition", "2011 Remaster"). The plain edition is shown; if there isn't one,
  the earliest. A single is never merged into an album of the same name.
- **Versions of a song** combine two sources. Spotify is searched by title,
  which shows what can be played now but can't tell two different songs with
  the same name apart. MusicBrainz links each recording to the composition it
  performs, which says who has really recorded this song. Spotify results by
  artists MusicBrainz confirms are listed as covers; the rest are listed
  separately as "same title — may be a different song". Each "Load more"
  reads 30 more Spotify results and 300 more MusicBrainz recordings, up to
  1,000.
- **Reviews** are read from the album's Wikipedia article: the scores table,
  which Wikipedia stores as structured data, and the first paragraphs of the
  reception section. This is Wikipedia's summary of the reviews, not the
  reviews themselves; full review text is licensed and not available.

## How the musician tools work

- **Tempo and key lookup.** Spotify closed this data to new apps. The app
  finds the recording in MusicBrainz (matching on title, artist and length, so
  it gets the studio cut rather than a live take) and reads its analysis from
  AcousticBrainz. That archive stopped growing in 2022 and its values are
  approximate, so the result is shown with "≈" and a link to measure by ear.
- **Listening.** Nothing is recorded or uploaded; the maths runs on the phone.
  Tempo comes from how regularly the loudness jumps; very fast songs can read
  at half speed, so both readings are shown. Key comes from which of the
  twelve notes are heard most, compared against the pattern of each key.
- **Tabs.** Tab sites hold licences to show tabs and don't offer them for
  reuse, so the app links to them rather than copying. The player
  ([alphaTab](https://alphatab.net), loaded only when a tab is opened) plays
  files you bring yourself. MIDI files are not supported.

## How notes sync

Notes are written to the device first, then sent to `api/notes.js`, which
stores them in Postgres. The app proves who you are with the Spotify sign-in it
already has — the server asks Spotify whose sign-in it is and files notes under
that account, so there is no second login and nobody else's notes are reachable.
If two devices edit the same note, the most recent edit wins. Deleting a note
on one device removes it from the others.

To run the database tests locally: `DATABASE_URL=postgres://… npm test`
(they are skipped when no database is given; CI always runs them).
