import { SimilarShelf } from '../components/Discover';
import { Status } from '../components/Shelf';
import { norm } from '../enrich/text';
import { useData } from '../lib/useData';
import * as api from '../spotify/api';
import { ui } from '../state/ui';

export function DiscoverView() {
  const top = useData('home:topArtists', api.topArtists);
  const followed = useData('library:artists', api.followedArtists);
  const seeds = (top.data?.items || []).slice(0, 4).map((a) => a.name);
  const waiting = top.loading || followed.loading;
  // "New to you" means: not among your most played and not someone you follow.
  const known = new Set([...(top.data?.items || []), ...(followed.data?.items || [])].map((a) => norm(a.name)));

  return (
    <div className="page">
      <header className="page-head"><h1>Discover</h1></header>
      <Status loading={waiting} error={top.error} />
      {!waiting && seeds.length === 0 && (
        <p className="status">Play some music first — suggestions here are built from the artists you listen to most.</p>
      )}
      {!waiting && seeds.length > 0 && (
        <>
          <div className="discover-hero">
            <div>
              <h2>New to you</h2>
              <p>A mix of artists you don’t follow yet, chosen from the neighbours of {seeds.slice(0, 3).join(', ')}.</p>
            </div>
            <button className="btn btn-primary" onClick={() => ui.set({ mix: { kind: 'surprise', seeds, known: [...known] } })}>Make the mix</button>
          </div>
          {seeds.map((name) => <SimilarShelf key={name} name={name} title={`Because you play ${name}`} exclude={known} />)}
          <p className="fineprint">Suggestions come from Last.fm or ListenBrainz listening data, then matched to Spotify. Open any artist and tap “Mix” for a mix built around them.</p>
        </>
      )}
    </div>
  );
}
