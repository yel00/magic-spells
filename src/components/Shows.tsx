import { go } from '../lib/router';
import { useData } from '../lib/useData';
import { artistShows, setlistSearchUrl, ShowsNotConfigured } from '../shows';
import { dateParts, placeLine } from '../shows/logic';
import type { ShowSummary } from '../shows/types';

/** One past concert: the date on the left, where it was on the right. Opens the show's page. */
export function ShowRow({ show, showArtist, badge }: { show: ShowSummary; showArtist?: boolean; badge?: string }) {
  const d = dateParts(show.date);
  const detail = [show.tour, show.songCount ? `${show.songCount} songs` : 'No setlist yet', badge].filter(Boolean).join(' · ');
  return (
    <button className="show-row" onClick={() => go(`/show/${show.id}`)}>
      <span className="show-date"><b>{d.day || '–'}</b><span>{d.month}</span><span>{d.year}</span></span>
      <span className="row-text">
        <span className="row-title">{showArtist ? show.artist.name : show.venue || show.city}</span>
        <span className="row-sub">{showArtist ? placeLine(show) : placeLine({ ...show, venue: '' })}</span>
        <span className="row-sub">{detail}</span>
      </span>
    </button>
  );
}

/** The latest few past shows on an artist's page, with a way to see them all. */
export function PastShows({ mbid, name }: { mbid: string; name: string }) {
  const { data, error } = useData(`pastshows:${mbid}`, () => artistShows(mbid).then((v) => v ?? false));
  if (error instanceof ShowsNotConfigured) {
    return <a className="chip chip-link videos-link" href={setlistSearchUrl(name)} target="_blank" rel="noreferrer">Past shows on setlist.fm ↗</a>;
  }
  if (!data) return null;
  return (
    <section className="about">
      <h2>Past shows</h2>
      <div className="show-list">
        {data.shows.slice(0, 4).map((s) => <ShowRow key={s.id} show={s} />)}
      </div>
      <button className="link-quiet" onClick={() => go(`/gigs/${mbid}`)}>All {data.total.toLocaleString()} shows, by year →</button>
    </section>
  );
}
