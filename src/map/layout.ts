// Lays out a music map: artists that are similar end up near each other.
// A small force simulation — linked artists pull together (harder the more
// similar they are), every artist pushes the others away, and a final pass
// nudges labels apart so names stay readable.

export interface MapNode {
  id: string;
  label: string;
  /** 0–1: how prominent the artist is (how much it is played, or how close it is to the centre). */
  size: number;
  /** Kept at the middle of the map. */
  pinned?: boolean;
}

export interface MapEdge {
  a: string;
  b: string;
  /** 0–1 similarity. */
  w: number;
}

export interface Point {
  x: number;
  y: number;
}

export const fontSize = (size: number) => 11 + Math.round(size * 7);
/** Rough label box; exact text metrics aren't needed to keep names from colliding. */
export const labelBox = (n: MapNode) => ({ w: n.label.length * fontSize(n.size) * 0.56 + 18, h: fontSize(n.size) + 12 });

export function layout(nodes: MapNode[], edges: MapEdge[], iterations = 260): Map<string, Point> {
  const n = nodes.length;
  const pos = nodes.map((node, i) => {
    if (node.pinned) return { x: 0, y: 0 };
    // Start on a sunflower spiral: evenly spread, and the same every time.
    const r = 60 + 26 * Math.sqrt(i + 1);
    const a = i * 2.399963;
    return { x: r * Math.cos(a), y: r * Math.sin(a) };
  });
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const links = edges
    .map((e) => ({ a: index.get(e.a), b: index.get(e.b), w: Math.max(0, Math.min(1, e.w)) }))
    .filter((e): e is { a: number; b: number; w: number } => e.a !== undefined && e.b !== undefined && e.a !== e.b);

  for (let it = 0; it < iterations; it++) {
    const cool = 1 - it / iterations;
    const fx = new Float64Array(n);
    const fy = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[i].x - pos[j].x;
        let dy = pos[i].y - pos[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = (i % 2 ? 1 : -1) * 0.5;
          dy = 0.5;
          d2 = 1;
        }
        const f = Math.min(9000 / d2, 40);
        const d = Math.sqrt(d2);
        fx[i] += (dx / d) * f;
        fy[i] += (dy / d) * f;
        fx[j] -= (dx / d) * f;
        fy[j] -= (dy / d) * f;
      }
    }
    for (const e of links) {
      const dx = pos[e.b].x - pos[e.a].x;
      const dy = pos[e.b].y - pos[e.a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      // The more similar, the shorter the spring and the harder it pulls.
      const rest = 70 + 230 * (1 - e.w);
      const f = (d - rest) * (0.02 + 0.06 * e.w);
      fx[e.a] += (dx / d) * f;
      fy[e.a] += (dy / d) * f;
      fx[e.b] -= (dx / d) * f;
      fy[e.b] -= (dy / d) * f;
    }
    for (let i = 0; i < n; i++) {
      if (nodes[i].pinned) continue;
      // A gentle pull to the middle keeps unconnected artists from drifting away.
      fx[i] -= pos[i].x * 0.012;
      fy[i] -= pos[i].y * 0.012;
      const step = Math.min(Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]), 30 * cool + 1);
      const mag = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]) || 1;
      pos[i].x += (fx[i] / mag) * step;
      pos[i].y += (fy[i] / mag) * step;
    }
  }

  // Push overlapping labels apart along whichever axis needs the smaller move.
  const boxes = nodes.map(labelBox);
  for (let pass = 0; pass < 80; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const ox = (boxes[i].w + boxes[j].w) / 2 - Math.abs(pos[i].x - pos[j].x);
        const oy = (boxes[i].h + boxes[j].h) / 2 - Math.abs(pos[i].y - pos[j].y);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const fixI = nodes[i].pinned ? 0 : nodes[j].pinned ? 1 : 0.5;
        const fixJ = 1 - fixI;
        if (ox < oy) {
          const dir = pos[i].x >= pos[j].x ? 1 : -1;
          pos[i].x += dir * ox * fixI;
          pos[j].x -= dir * ox * fixJ;
        } else {
          const dir = pos[i].y >= pos[j].y ? 1 : -1;
          pos[i].y += dir * oy * fixI;
          pos[j].y -= dir * oy * fixJ;
        }
      }
    }
    if (!moved) break;
  }
  return new Map(nodes.map((node, i) => [node.id, { x: Math.round(pos[i].x), y: Math.round(pos[i].y) }]));
}

/** Group artists into neighbourhoods: each artist adopts the group most of its (weighted) neighbours belong to. */
export function clusters(nodes: MapNode[], edges: MapEdge[]): Map<string, number> {
  const group = new Map(nodes.map((n, i) => [n.id, i]));
  const near = new Map<string, { id: string; w: number }[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    near.get(e.a)?.push({ id: e.b, w: e.w });
    near.get(e.b)?.push({ id: e.a, w: e.w });
  }
  for (let round = 0; round < 12; round++) {
    let changed = false;
    for (const n of nodes) {
      const votes = new Map<number, number>();
      for (const m of near.get(n.id) || []) votes.set(group.get(m.id)!, (votes.get(group.get(m.id)!) || 0) + m.w);
      let best = group.get(n.id)!;
      let bestW = votes.get(best) || 0;
      for (const [g, w] of votes) if (w > bestW + 1e-9 || (Math.abs(w - bestW) < 1e-9 && g < best)) [best, bestW] = [g, w];
      if (best !== group.get(n.id)) {
        group.set(n.id, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  // Renumber so the biggest neighbourhood is 0, the next 1, and so on.
  const sizes = new Map<number, number>();
  for (const g of group.values()) sizes.set(g, (sizes.get(g) || 0) + 1);
  const rank = new Map([...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([g], i) => [g, i]));
  return new Map([...group.entries()].map(([id, g]) => [id, rank.get(g)!]));
}
