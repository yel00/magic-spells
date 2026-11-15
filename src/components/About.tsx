import { useState } from 'react';
import type { CreditGroup, Link, Related, Summary } from '../enrich/types';
import { go } from '../lib/router';

export function AboutText({ summary }: { summary: Summary }) {
  const [open, setOpen] = useState(false);
  const long = summary.text.length > 260;
  return (
    <div className="about-text">
      <p className={long && !open ? 'clamp' : ''}>{summary.text}</p>
      <div className="about-foot">
        {long && <button className="link-quiet" onClick={() => setOpen(!open)}>{open ? 'Show less' : 'Read more'}</button>}
        <a className="link-quiet" href={summary.url} target="_blank" rel="noreferrer">{summary.source} ↗</a>
      </div>
    </div>
  );
}

export function Facts({ items, label }: { items: string[]; label?: string }) {
  if (!items.length) return null;
  return (
    <p className="facts">
      {items.map((item, i) => (
        <span key={i}>
          {i > 0 && ' · '}
          {/* The label's name links to everything on that label. */}
          {label && item.includes(label)
            ? <button className="link-quiet inline" onClick={() => go(`/label/${encodeURIComponent(label)}`)}>{item}</button>
            : item}
        </span>
      ))}
    </p>
  );
}

/** Genre chips; each opens the artists Spotify files under that genre. */
export function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="chips">
      {items.map((g) => <button key={g} className="chip chip-tap" onClick={() => go(`/genre/${encodeURIComponent(g)}`)}>{g}</button>)}
    </div>
  );
}

/** Band members, or the bands a person belongs to; each opens that artist's credits page. */
export function RelatedChips({ title, items }: { title: string; items: Related[] | undefined }) {
  if (!items?.length) return null;
  return (
    <div className="related">
      <h3>{title}</h3>
      <div className="chips">
        {items.map((r) => (
          <button key={r.mbid} className="chip chip-tap chip-person" onClick={() => go(`/person/${r.mbid}`)}>
            <span>{r.name}</span>
            {r.detail && <span className="chip-detail">{r.detail}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Links({ links }: { links: Link[] }) {
  if (!links.length) return null;
  return (
    <div className="chips">
      {links.map((l) => <a key={l.label} className="chip chip-link" href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
    </div>
  );
}

export function Credits({ groups }: { groups: CreditGroup[] }) {
  if (!groups.length) return null;
  return (
    <div className="credits">
      {groups.map((g) => (
        <div key={g.title} className="credit-group">
          <h3>{g.title}</h3>
          <ul>
            {g.people.map((p) => (
              <li key={p.name}>
                {p.mbid
                  ? <button className="credit-name" onClick={() => go(`/person/${p.mbid}`)}>{p.name}</button>
                  : <span>{p.name}</span>}
                {p.detail && <span className="credit-detail">{p.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AboutSkeleton() {
  return <div className="about-skeleton" aria-label="Loading background"><i /><i /><i /></div>;
}
