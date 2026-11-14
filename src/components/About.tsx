import { useState } from 'react';
import type { CreditGroup, Link, Summary } from '../enrich/types';

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

export function Facts({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <p className="facts">{items.join(' · ')}</p>;
}

export function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return <div className="chips">{items.map((g) => <span key={g} className="chip">{g}</span>)}</div>;
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
                <span>{p.name}</span>
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
