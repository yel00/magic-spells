import { useEffect, useState } from 'react';
import { invalidate } from '../lib/useData';
import * as api from '../spotify/api';
import { toast } from '../state/ui';
import { HeartIcon } from './Icons';

/** A heart that adds a song to Liked Songs, or takes it out. */
export function LikeButton({ uri, size = 24 }: { uri: string; size?: number }) {
  // null while we don't yet know whether the song is liked.
  const [liked, setLiked] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    setLiked(null);
    api.libraryContains([uri]).then((r) => live && setLiked(!!r[0]), () => live && setLiked(false));
    return () => {
      live = false;
    };
  }, [uri]);

  const toggle = async () => {
    const want = !liked;
    setLiked(want);
    try {
      await (want ? api.saveToLibrary([uri]) : api.removeFromLibrary([uri]));
      invalidate('library:tracks');
      toast(want ? 'Added to Liked Songs' : 'Removed from Liked Songs');
    } catch {
      setLiked(!want);
      toast('Couldn’t update your library.');
    }
  };

  return (
    <button className={`icon-btn like-btn ${liked ? 'on' : ''}`} onClick={toggle} disabled={liked === null} aria-pressed={!!liked} aria-label={liked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}>
      <HeartIcon size={size} filled={!!liked} />
    </button>
  );
}
