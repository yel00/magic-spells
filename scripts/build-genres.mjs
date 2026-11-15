// Builds public/genres.json: a map of music genres from Wikidata (CC0, free to
// reuse). Each genre has its parent genres ("is a kind of"), the genres it
// grew out of, a size from how widely it is written about, a family for
// colouring, and a position computed here so phones don't have to.
//
// Run by hand when the data should be refreshed:  node scripts/build-genres.mjs
// The output is committed, so normal builds never depend on Wikidata.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layout } from '../src/map/layout.ts';

const QUERY = `
SELECT ?g ?gLabel ?links ?title (GROUP_CONCAT(DISTINCT ?p; separator="|") AS ?parents) (GROUP_CONCAT(DISTINCT ?i; separator="|") AS ?influences) WHERE {
  ?g wdt:P31/wdt:P279* wd:Q188451 .
  ?g wikibase:sitelinks ?links . FILTER(?links >= 8)
  ?article schema:about ?g ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title .
  OPTIONAL { ?g wdt:P279 ?p . ?p wdt:P31/wdt:P279* wd:Q188451 . }
  OPTIONAL { ?g wdt:P737 ?i . ?i wdt:P31/wdt:P279* wd:Q188451 . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} GROUP BY ?g ?gLabel ?links ?title`;

const res = await fetch('https://query.wikidata.org/sparql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json', 'User-Agent': 'magic-spells-build/0.1 (personal project; one-off dataset build)' },
  body: new URLSearchParams({ query: QUERY }),
});
if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
const rows = (await res.json()).results.bindings;

const qid = (uri) => uri.split('/').pop();
const raw = new Map();
for (const r of rows) {
  const label = r.gLabel.value;
  if (/^Q\d+$/.test(label)) continue; // no English name
  raw.set(qid(r.g.value), {
    id: qid(r.g.value), name: label.replace(/ music$/i, ''), title: r.title.value, links: Number(r.links.value),
    parents: r.parents.value ? r.parents.value.split('|').map(qid) : [], influences: r.influences.value ? r.influences.value.split('|').map(qid) : [],
  });
}
// Keep only links that point at genres we kept, and drop self-links.
for (const g of raw.values()) {
  g.parents = g.parents.filter((p) => p !== g.id && raw.has(p));
  g.influences = g.influences.filter((p) => p !== g.id && raw.has(p) && !g.parents.includes(p));
}

// Family = the nearest well-known ancestor ("is a kind of"), so that, say, shoegaze
// is coloured as rock rather than as the catch-all "popular music" above it.
const ANCHORS = ['rock', 'jazz', 'electronic', 'hip-hop', 'pop', 'folk', 'classical', 'heavy metal', 'blues', 'country', 'reggae', 'punk rock', 'rhythm and blues', 'soul', 'funk', 'electronic dance', 'house', 'techno', 'opera', 'Latin'];
const anchorIndex = (g) => ANCHORS.findIndex((a) => a.toLowerCase() === g.name.toLowerCase());
const familyOf = (g) => {
  const seen = new Set([g.id]);
  let level = [g];
  while (level.length) {
    // Nearest first; among equally near anchors, the best known.
    const hit = level.filter((x) => anchorIndex(x) >= 0).sort((a, b) => b.links - a.links)[0];
    if (hit) return hit.name;
    level = level.flatMap((x) => x.parents.map((p) => raw.get(p))).filter((x) => !seen.has(x.id) && seen.add(x.id));
  }
  return null;
};
const familyCount = new Map();
for (const g of raw.values()) {
  g.family = familyOf(g);
  if (g.family) familyCount.set(g.family, (familyCount.get(g.family) || 0) + 1);
}
// House and techno fold into electronic dance, which folds into electronic, to keep the palette readable.
const MERGE = { house: 'electronic', techno: 'electronic', 'electronic dance': 'electronic', 'punk rock': 'rock', soul: 'rhythm and blues', funk: 'rhythm and blues', opera: 'classical' };
for (const g of raw.values()) if (g.family && MERGE[g.family.toLowerCase()]) g.family = [...raw.values()].find((x) => x.name.toLowerCase() === MERGE[g.family.toLowerCase()])?.name ?? g.family;
const merged = new Map();
for (const g of raw.values()) if (g.family) merged.set(g.family, (merged.get(g.family) || 0) + 1);
const families = [...merged.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
console.log('families:', [...merged.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n} ${c}`).join(', '), '| other', [...raw.values()].filter((g) => !g.family).length);

const list = [...raw.values()].sort((a, b) => b.links - a.links);
const maxLinks = Math.log(list[0].links);
const minLinks = Math.log(8);
const index = new Map(list.map((g, i) => [g.id, i]));
const nodes = list.map((g) => ({ id: g.id, label: g.name, size: Math.round(((Math.log(g.links) - minLinks) / (maxLinks - minLinks)) * 100) / 100 }));
const edges = list.flatMap((g) => [...g.parents.map((p) => ({ a: g.id, b: p, w: 0.85 })), ...g.influences.map((p) => ({ a: g.id, b: p, w: 0.4 }))]);

console.log(`${list.length} genres, ${edges.length} links; laying out…`);
const started = Date.now();
const pos = layout(nodes, edges, 320, 700);
console.log(`laid out in ${((Date.now() - started) / 1000).toFixed(1)}s`);

const out = {
  source: 'Wikidata (CC0)',
  built: new Date().toISOString().slice(0, 10),
  families,
  // n name, t Wikipedia title, s size 0–1, f family index (-1 = other), p parents, i grew out of, x/y position
  genres: list.map((g, k) => ({
    n: g.name, t: g.title, s: nodes[k].size, f: g.family ? families.indexOf(g.family) : -1,
    p: g.parents.map((p) => index.get(p)), i: g.influences.map((p) => index.get(p)), x: pos.get(g.id).x, y: pos.get(g.id).y,
  })),
};
const file = join(dirname(fileURLToPath(import.meta.url)), '../public/genres.json');
writeFileSync(file, JSON.stringify(out));
console.log(`wrote ${file}: ${out.genres.length} genres, families: ${out.families.join(', ')}`);
