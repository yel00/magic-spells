import type { ReactNode } from 'react';
import { go } from '../lib/router';
import type { Image } from '../spotify/types';
import { Art } from './Art';

export function Shelf({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="shelf">
      <h2>{title}</h2>
      <div className="shelf-scroll">{children}</div>
    </section>
  );
}

export function Card({
  title,
  subtitle,
  images,
  to,
  round,
}: {
  title: string;
  subtitle?: string;
  images: Image[] | null | undefined;
  to: string;
  round?: boolean;
}) {
  return (
    <button className={`card ${round ? 'card-round' : ''}`} onClick={() => go(to)}>
      <Art images={images} size={150} round={round} />
      <span className="card-title">{title}</span>
      {subtitle && <span className="card-sub">{subtitle}</span>}
    </button>
  );
}

export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid">{children}</div>;
}

export function Status({ loading, error, empty }: { loading?: boolean; error?: Error; empty?: string | false }) {
  if (error) return <p className="status">Couldn’t load this. {error.message}</p>;
  if (loading) return <div className="status"><span className="spinner" /></div>;
  if (empty) return <p className="status">{empty}</p>;
  return null;
}
