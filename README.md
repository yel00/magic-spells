# Magic Spells

A fast, lightweight remote and browser for Spotify, built for iPhone and iPad.
Think of it as a small Roon for a Spotify account: it controls any Spotify
Connect speaker, shows your library, and (in later phases) adds the context
Spotify leaves out — credits, biographies, lyrics notes, live versions, concerts.

It is an installable web app. Spotify itself plays the audio; this app is the
remote, so nothing here streams or stores music.

## What works today (phases 1–5)

- Sign in with Spotify (no server, no secret — PKCE)
- Now playing: artwork, seek, play/pause/skip, shuffle, repeat, volume
- Spotify Connect: see every available device and move playback between them
- Queue: see what's next, add any track
- Home: jump back in, your playlists, top artists, on repeat lately
- Library: playlists, albums, artists, liked songs
- Search across Spotify
- Album, artist and playlist pages; save albums, follow artists, like songs
- Playlists: create one and add tracks from anywhere
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
6. Musician tools: BPM/key lookup, microphone analyzer, tab search and player
7. Later: Beatport (needs partner access), native shell for TestFlight, NAS files

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

## How notes sync

Notes are written to the device first, then sent to `api/notes.js`, which
stores them in Postgres. The app proves who you are with the Spotify sign-in it
already has — the server asks Spotify whose sign-in it is and files notes under
that account, so there is no second login and nobody else's notes are reachable.
If two devices edit the same note, the most recent edit wins. Deleting a note
on one device removes it from the others.

To run the database tests locally: `DATABASE_URL=postgres://… npm test`
(they are skipped when no database is given; CI always runs them).
