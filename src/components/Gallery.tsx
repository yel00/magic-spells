import type { Picture } from '../enrich/artwork';
import { useStore } from '../lib/store';
import { ui } from '../state/ui';

/** A strip of pictures; tapping one opens it large. */
export function Gallery({ title, pictures, tall }: { title: string; pictures: Picture[]; tall?: boolean }) {
  if (!pictures.length) return null;
  return (
    <section className={`shelf gallery ${tall ? 'gallery-tall' : ''}`}>
      <h2>{title}</h2>
      <div className="shelf-scroll">
        {pictures.map((p, i) => (
          <button key={i} className="gallery-item" onClick={() => ui.set({ pictures: { list: pictures, at: i } })}>
            <img src={p.thumb} alt={p.label} loading="lazy" decoding="async" draggable={false} />
            <span className="card-sub">{p.label}</span>
          </button>
        ))}
      </div>
      <p className="fineprint gallery-credit">From {pictures[0].source}. Tap a picture to see it large.</p>
    </section>
  );
}

/** One picture filling the screen, with arrows to move through the set. */
export function PictureViewer() {
  const state = useStore(ui).pictures;
  if (!state) return null;
  const { list, at } = state;
  const p = list[at];
  const step = (by: number) => ui.set({ pictures: { list, at: (at + by + list.length) % list.length } });
  return (
    <div className="viewer" role="dialog" aria-label={p.label}>
      <button className="viewer-close icon-btn" onClick={() => ui.set({ pictures: null })} aria-label="Close">✕</button>
      <div className="viewer-stage" onClick={() => ui.set({ pictures: null })}>
        <img key={p.full} src={p.full} alt={p.label} onClick={(e) => e.stopPropagation()} />
      </div>
      <div className="viewer-foot">
        {list.length > 1 && <button className="icon-btn" onClick={() => step(-1)} aria-label="Previous picture">‹</button>}
        <span className="row-text">
          <span className="row-title">{p.label}</span>
          <span className="row-sub">
            {list.length > 1 ? `${at + 1} of ${list.length} · ` : ''}{p.source}
            {p.link && <> · <a href={p.link} target="_blank" rel="noreferrer">details and credit ↗</a></>}
          </span>
        </span>
        {list.length > 1 && <button className="icon-btn" onClick={() => step(1)} aria-label="Next picture">›</button>}
      </div>
    </div>
  );
}
