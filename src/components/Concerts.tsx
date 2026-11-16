import { useState } from 'react';
import { concertDay, concertTime } from '../concerts/logic';
import { currentPosition, searchPlaces, setPlace, type PlaceHit } from '../concerts/store';
import type { Concert, Place } from '../concerts/types';

export function ConcertCard({ concert, isNew, showArtist = true }: { concert: Concert; isNew?: boolean; showArtist?: boolean }) {
  const d = concertDay(concert.date);
  const headline = showArtist ? concert.artists.join(', ') : concert.name;
  const others = concert.lineup.filter((n) => !concert.artists.includes(n));
  const sub = showArtist && concert.name !== concert.artists[0] ? concert.name : others.length ? `with ${others.slice(0, 3).join(', ')}` : '';
  return (
    <a className={`concert ${concert.image ? 'concert-with-art' : ''}`} href={concert.url} target="_blank" rel="noreferrer">
      {concert.image && <img className="concert-art" src={concert.image} alt="" loading="lazy" decoding="async" />}
      <span className="concert-date">
        <span className="concert-month">{d.month}</span>
        <span className="concert-day">{d.day}</span>
        <span className="concert-weekday">{d.weekday}</span>
      </span>
      <span className="row-text">
        <span className="row-title">{headline}{isNew && <span className="new-dot" aria-label="New" />}</span>
        {sub && <span className="row-sub">{sub}</span>}
        <span className="row-sub">
          {[concert.venue, concert.city, concertTime(concert.time), concert.distance !== undefined && `${concert.distance} mi`].filter(Boolean).join(' · ')}
        </span>
        {concert.status && <span className="concert-status">{concert.status}</span>}
      </span>
      <span className="concert-go">Tickets ↗</span>
    </a>
  );
}

const RADII = [25, 50, 100, 200];

export function PlacePicker({ place }: { place: Place | null }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [radius, setRadius] = useState(place?.radius ?? 50);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const choose = (hit: PlaceHit) => {
    setHits(null);
    setQuery('');
    setPlace({ ...hit, radius });
  };
  const find = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const found = await searchPlaces(query.trim());
      setHits(found);
      if (!found.length) setMessage(`No place found for “${query.trim()}”.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Place search failed.');
    }
    setBusy(false);
  };
  const locate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      choose(await currentPosition());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Couldn’t get your location.');
    }
    setBusy(false);
  };

  return (
    <div className="place-picker">
      <form className="new-playlist" onSubmit={(e) => { e.preventDefault(); find(); }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="City or town" aria-label="City or town" autoCorrect="off" />
        <button className="btn" disabled={busy || !query.trim()}>Find</button>
      </form>
      <button className="btn btn-quiet place-locate" onClick={locate} disabled={busy}>Use my current location</button>
      {message && <p className="error">{message}</p>}
      {hits?.map((h) => (
        <button key={`${h.lat},${h.lon}`} className="action" onClick={() => choose(h)}>{h.name}</button>
      ))}
      <div className="segments radius" role="radiogroup" aria-label="How far to look">
        {RADII.map((r) => (
          <button
            key={r}
            role="radio"
            aria-checked={radius === r}
            className={radius === r ? 'on' : ''}
            onClick={() => {
              setRadius(r);
              if (place) setPlace({ ...place, radius: r });
            }}
          >
            {r} mi
          </button>
        ))}
      </div>
    </div>
  );
}
