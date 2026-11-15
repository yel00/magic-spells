import { useEffect, useMemo, useRef, useState } from 'react';
import { fontSize, labelBox, type MapEdge, type MapNode, type Point } from '../map/layout';

export interface DrawnNode extends MapNode {
  kind: 'centre' | 'mine' | 'near' | 'rec';
  /** Neighbourhood colour index. */
  group?: number;
  dim?: boolean;
}

const PALETTE = ['#c9b6ff', '#9ad1d4', '#ffb4a2', '#b7e4c7', '#a2d2ff', '#f1c0e8', '#f4a261', '#e9d8a6'];

interface View {
  x: number;
  y: number;
  k: number;
}

/** A pannable, zoomable map of artist names. Drag to move, pinch or scroll to zoom, tap a name to select it. */
export function MapCanvas({
  nodes, edges, positions, selected, onSelect,
}: {
  nodes: DrawnNode[];
  edges: MapEdge[];
  positions: Map<string, Point>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; startDist: number; startK: number } | null>(null);

  const bounds = useMemo(() => {
    let minX = -100, maxX = 100, minY = -100, maxY = 100;
    for (const n of nodes) {
      const p = positions.get(n.id);
      if (!p) continue;
      const b = labelBox(n);
      minX = Math.min(minX, p.x - b.w / 2);
      maxX = Math.max(maxX, p.x + b.w / 2);
      minY = Math.min(minY, p.y - b.h / 2);
      maxY = Math.max(maxY, p.y + b.h / 2);
    }
    return { minX, maxX, minY, maxY };
  }, [nodes, positions]);

  const fit = () => {
    const el = host.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const k = Math.min(width / (bounds.maxX - bounds.minX + 40), height / (bounds.maxY - bounds.minY + 40), 1.6);
    setView({ k, x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * k, y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * k });
  };
  // Re-fit when the map's contents change size, not on every selection.
  useEffect(fit, [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY]); // eslint-disable-line react-hooks/exhaustive-deps

  const zoomAt = (cx: number, cy: number, factor: number) =>
    setView((v) => {
      const k = Math.max(0.25, Math.min(4, v.k * factor));
      return { k, x: cx - ((cx - v.x) / v.k) * k, y: cy - ((cy - v.y) / v.k) * k };
    });

  const local = (e: { clientX: number; clientY: number }) => {
    const r = host.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    gesture.current = { moved: gesture.current?.moved ?? 0, startDist: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, startK: view.k };
  };
  const onMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev || !gesture.current) return;
    const now = local(e);
    pointers.current.set(e.pointerId, now);
    const pts = [...pointers.current.values()];
    if (pts.length === 1) {
      gesture.current.moved += Math.abs(now.x - prev.x) + Math.abs(now.y - prev.y);
      setView((v) => ({ ...v, x: v.x + now.x - prev.x, y: v.y + now.y - prev.y }));
    } else if (pts.length === 2 && gesture.current.startDist) {
      gesture.current.moved += 10;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const want = gesture.current.startK * (d / gesture.current.startDist);
      zoomAt((pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2, want / view.k);
    }
  };
  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size) return;
    // A press that barely moved is a tap: select the name under it, or clear the selection.
    if ((gesture.current?.moved ?? 0) < 8) {
      const id = (e.target as Element).closest?.('[data-id]')?.getAttribute('data-id') ?? null;
      onSelect(id === selected ? null : id);
    }
    gesture.current = null;
  };

  const linked = new Set<string>();
  if (selected) for (const e of edges) if (e.a === selected || e.b === selected) linked.add(e.a === selected ? e.b : e.a);

  return (
    <div
      className="map-canvas"
      ref={host}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={(e) => { pointers.current.delete(e.pointerId); gesture.current = null; }}
      onWheel={(e) => zoomAt(local(e).x, local(e).y, e.deltaY < 0 ? 1.12 : 1 / 1.12)}
    >
      <svg width="100%" height="100%" role="img" aria-label="Map of similar artists">
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {edges.map((e) => {
            const a = positions.get(e.a);
            const b = positions.get(e.b);
            if (!a || !b) return null;
            const hot = selected !== null && (e.a === selected || e.b === selected);
            return <line key={`${e.a}|${e.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={hot ? 'map-edge map-edge-hot' : 'map-edge'} strokeOpacity={hot ? 0.9 : selected ? 0.05 : 0.08 + e.w * 0.22} />;
          })}
          {nodes.map((n) => {
            const p = positions.get(n.id);
            if (!p) return null;
            const faded = n.dim || (selected !== null && n.id !== selected && !linked.has(n.id));
            const colour = n.kind === 'rec' ? '#ffd98a' : n.kind === 'centre' ? '#ffffff' : PALETTE[(n.group ?? 0) % PALETTE.length];
            const box = labelBox(n);
            return (
              <g key={n.id} data-id={n.id} transform={`translate(${p.x} ${p.y})`} className={`map-node ${n.id === selected ? 'map-node-on' : ''}`} opacity={faded ? 0.22 : 1}>
                <rect x={-box.w / 2} y={-box.h / 2} width={box.w} height={box.h} rx={box.h / 2} className="map-pill" stroke={n.kind === 'rec' ? '#ffd98a' : 'none'} strokeDasharray={n.kind === 'rec' ? '3 3' : undefined} />
                <text textAnchor="middle" dominantBaseline="central" fontSize={fontSize(n.size)} fontWeight={n.kind === 'centre' ? 700 : 500} fill={colour}>{n.label}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="map-zoom">
        <button onClick={() => zoomAt(host.current!.clientWidth / 2, host.current!.clientHeight / 2, 1.3)} aria-label="Zoom in">+</button>
        <button onClick={() => zoomAt(host.current!.clientWidth / 2, host.current!.clientHeight / 2, 1 / 1.3)} aria-label="Zoom out">−</button>
        <button onClick={fit} aria-label="Fit the whole map">⤢</button>
      </div>
    </div>
  );
}
