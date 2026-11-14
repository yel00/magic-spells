# Magic Spells

A fast, lightweight remote and browser for Spotify, built for iPhone and iPad.
Think of it as a small Roon for a Spotify account: it controls any Spotify
Connect speaker, shows your library, and (in later phases) adds the context
Spotify leaves out — credits, biographies, lyrics notes, live versions, concerts.

It is an installable web app. Spotify itself plays the audio; this app is the
remote, so nothing here streams or stores music.

## What works today (phases 1 and 2)

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
6. **On the iPhone/iPad**: open the site in Safari → Share → Add to Home Screen.

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
3. Listening notes, synced between devices
4. Discovery (Last.fm / ListenBrainz) and YouTube live versions
5. Concert scanner with notifications
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
same way. Listening notes will need a small database.
