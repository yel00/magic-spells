import { useEffect, useState } from 'react';
import { ConcertCard, PlacePicker } from '../components/Concerts';
import { ChevronLeft } from '../components/Icons';
import { concerts, markSeen, scan } from '../concerts/store';
import { useStore } from '../lib/store';

export function ConcertsView() {
  const s = useStore(concerts);
  const [editing, setEditing] = useState(false);
  // Remember what was new when the page opened, so the dots stay while it is being read.
  const [seenAtOpen] = useState(() => new Set(s.seen));

  useEffect(() => {
    scan();
    return markSeen;
  }, []);

  const scanning = s.status === 'scanning';
  return (
    <div className="page">
      <header className="page-head">
        <button className="icon-btn back-inline" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
        <h1>Concerts</h1>
      </header>

      {!s.place || editing ? (
        <section className="about">
          <p className="facts">
            {s.place ? `Looking around ${s.place.name}.` : 'Choose where to look. The app then checks whether artists you follow or play a lot have shows nearby.'}
          </p>
          <PlacePicker place={s.place} />
          {s.place && <button className="btn" onClick={() => setEditing(false)}>Done</button>}
        </section>
      ) : (
        <div className="concert-bar">
          <span>Within {s.place.radius} mi of <strong>{s.place.name}</strong></span>
          <button className="link-quiet" onClick={() => setEditing(true)}>Change</button>
        </div>
      )}

      {s.place && !editing && (
        <>
          {scanning && (
            <div className="mix-building concert-progress">
              <p>Checking {s.progress[1] || 'your'} artists…</p>
              <div className="bar"><span style={{ width: `${s.progress[1] ? (s.progress[0] / s.progress[1]) * 100 : 5}%` }} /></div>
            </div>
          )}
          {s.status === 'unconfigured' && (
            <p className="status">Concert listings come from Ticketmaster, which isn’t connected yet. Add a Ticketmaster API key to the server to turn this on.</p>
          )}
          {s.status === 'failed' && <p className="status">Couldn’t check for concerts just now.</p>}
          {!scanning && s.status !== 'unconfigured' && s.scannedAt > 0 && s.concerts.length === 0 && (
            <p className="status">None of your {s.watching} artists have shows listed near here yet.</p>
          )}
          <div className="concert-list">
            {s.concerts.map((c) => <ConcertCard key={c.id} concert={c} isNew={!seenAtOpen.has(c.id)} />)}
          </div>
          {!scanning && s.scannedAt > 0 && (
            <p className="fineprint">
              Checked {s.watching} artists {new Date(s.scannedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.
              Listings are from Ticketmaster, so shows sold only through other sellers won’t appear.{' '}
              <button className="link-quiet inline" onClick={() => scan(true)}>Check again</button>
            </p>
          )}
        </>
      )}
    </div>
  );
}
