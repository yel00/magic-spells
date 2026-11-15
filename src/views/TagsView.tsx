import { ChevronLeft } from '../components/Icons';
import { TagBrowser } from '../components/Tags';

export function TagsView({ tag }: { tag?: string }) {
  return (
    <div className="page">
      <header className="page-head">
        <button className="icon-btn back-inline" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
        <h1>Tags</h1>
      </header>
      <TagBrowser initial={tag} />
    </div>
  );
}
