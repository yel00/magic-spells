import { useState } from 'react';
import { AboutSkeleton, AboutText, Chips, Facts, Links, RelatedChips } from '../components/About';
import { ChevronLeft } from '../components/Icons';
import { Status } from '../components/Shelf';
import { findOnSpotify } from '../discover';
import { personInfo } from '../enrich';
import { creditsFor, type Work } from '../enrich/discogs';
import { go } from '../lib/router';
import { useData } from '../lib/useData';
import { openAlbum } from '../spotify/resolve';
import { isDemo } from '../spotify/auth';
import { demoCredits } from '../enrich/demo';

function WorkRow({ work }: { work: Work }) {
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    await openAlbum(work.title, work.artist);
    setBusy(false);
  };
  return (
    <button className="work" onClick={open} disabled={busy}>
      <span className="row-text">
        <span className="row-title">{work.title}</span>
        <span className="row-sub">{[work.artist, work.year].filter(Boolean).join(' · ')}</span>
      </span>
      {busy && <span className="spinner" />}
    </button>
  );
}

function WorkList({ role, works }: { role: string; works: Work[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? works : works.slice(0, 8);
  return (
    <div className="credit-group">
      <h3>{role} · {works.length}</h3>
      <div className="works">
        {shown.map((w) => <WorkRow key={`${w.artist}|${w.title}`} work={w} />)}
      </div>
      {works.length > 8 && <button className="link-quiet" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${works.length}`}</button>}
    </div>
  );
}

/** A page for anyone with a credit — producer, session player, songwriter — and what they worked on. */
export function PersonView({ id }: { id: string }) {
  const info = useData(`person:${id}`, () => personInfo(id).then((v) => v ?? false));
  const p = info.data || null;
  const name = p?.name || id.replace(/^~|^demo-/, '');
  const credits = useData(p ? `person:${id}:credits` : null, () =>
    isDemo() ? Promise.resolve(demoCredits(name)) : p!.discogsId ? creditsFor(p!.discogsId).then((v) => v ?? false) : Promise.resolve(false as const),
  );
  const spotify = useData(p ? `person:${id}:spotify` : null, () => findOnSpotify(name).then((v) => v ?? false).catch(() => false as const));
  const fetched = credits.data ? credits.data.groups.reduce((n, g) => n + g.works.length, 0) : 0;

  return (
    <div className="page">
      <header className="page-head person-head">
        <button className="icon-btn back-inline" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
        <div className="row-text">
          <span className="kicker">Credits</span>
          <h1>{name}</h1>
        </div>
      </header>

      <Status loading={info.loading} error={info.error} />
      {info.data === false && <p className="status">There’s no detailed record for {name} in MusicBrainz.</p>}

      {p && (
        <section className="about">
          {spotify.data && <button className="btn btn-primary person-open" onClick={() => go(`/artist/${(spotify.data as { id: string }).id}`)}>Open {name} on Spotify</button>}
          {p.bio && <AboutText summary={p.bio} />}
          <Facts items={p.facts} />
          <Chips items={p.genres} />
          <RelatedChips title="Member of" items={p.memberOf} />
          <RelatedChips title="Members" items={p.members} />
          <Links links={p.links} />
        </section>
      )}

      {p && (
        <section className="about">
          <h2>Worked on</h2>
          {credits.loading && <AboutSkeleton />}
          {credits.data === false && <p className="facts">No list of credits is available for {name}.</p>}
          {credits.data && (
            <>
              <div className="credits">
                {credits.data.groups.map((g) => <WorkList key={g.role} role={g.role} works={g.works} />)}
              </div>
              <p className="fineprint flush">
                Credits from Discogs{credits.data.total > 300 ? `, the most recent ${fetched} albums of ${credits.data.total} releases listed` : ''}. Tap one to open it on Spotify.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
