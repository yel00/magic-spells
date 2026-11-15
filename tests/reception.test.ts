import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ratingTables, readScore, receptionText, titleFromUrl } from '../src/enrich/reception';

// A trimmed copy of the reception and legacy sections of a real Wikipedia album article.
const html = readFileSync(join(__dirname, 'fixtures/wikipedia-ok-computer-reception.html'), 'utf8');

describe('review scores from a real article', () => {
  const tables = ratingTables(html);
  it('finds both the original and the retrospective tables', () => {
    expect(tables.map((t) => t.title)).toEqual(['Contemporaneous reviews', 'Retrospective reviews (after 1997)']);
    expect(tables[1].ratings.find((r) => r.source === 'AllMusic')).toEqual({ source: 'AllMusic', score: '5/5', fraction: 1 });
    expect(tables[1].ratings.find((r) => r.source.startsWith('Christgau'))?.score).toBe('B−');
  });
  it('reads sources and scores in every format', () => {
    const first = tables[0].ratings;
    expect(first).toHaveLength(10);
    expect(first[0]).toEqual({ source: 'Chicago Tribune', score: '3.5/4', fraction: 0.875 });
    expect(first.find((r) => r.source === 'Entertainment Weekly')).toEqual({ source: 'Entertainment Weekly', score: 'B+' });
    expect(first.find((r) => r.source === 'Pitchfork')).toEqual({ source: 'Pitchfork', score: '10/10', fraction: 1 });
    expect(first.find((r) => r.source === 'Q')?.score).toBe('5/5');
  });
  it('leaves no markup or footnotes in the names', () => {
    for (const t of tables) for (const r of [...t.ratings, ...t.aggregate]) expect(`${r.source} ${r.score}`).not.toMatch(/[[\]{}<>]|''|<ref/);
  });
});

describe('reception text from a real article', () => {
  const text = receptionText(html)!;
  it('starts at the reception heading, not an earlier section', () => {
    expect(text.anchor).toBe('Critical_reception');
    expect(text.paragraphs[0]).toMatch(/^OK Computer /);
    expect(text.paragraphs.join(' ')).not.toMatch(/Earlier section text/);
  });
  it('returns clean prose: no tags, footnote markers or stray whitespace', () => {
    expect(text.paragraphs.length).toBeGreaterThanOrEqual(2);
    for (const p of text.paragraphs) {
      expect(p).not.toMatch(/<|>|\[\d+\]|\[nb|\s{2,}|&[a-z]+;/);
      expect(p.length).toBeGreaterThan(60);
    }
  });
});

describe('score formats', () => {
  it.each([
    ['{{Rating|4.5|5}}<ref name="x"/>', { score: '4.5/5', fraction: 0.9 }],
    ['{{rating|3|4}}', { score: '3/4', fraction: 0.75 }],
    ['8.2/10<ref>cite</ref>', { score: '8.2/10', fraction: 0.82 }],
    ['81/100', { score: '81/100', fraction: 0.81 }],
    ['92%', { score: '92%', fraction: 0.92 }],
    ['{{Rating-Christgau|A-}}', { score: 'A−' }],
    ["''(favorable)''", { score: '(favorable)' }],
  ])('%s', (wt, want) => expect(readScore(wt)).toEqual(want));
  it('ignores an empty score', () => {
    expect(readScore('')).toBeNull();
    expect(readScore('<ref name="only"/>')).toBeNull();
  });
});

describe('article lookups', () => {
  it('gets the article title from desktop and mobile links', () => {
    expect(titleFromUrl('https://en.wikipedia.org/wiki/OK_Computer')).toBe('OK_Computer');
    expect(titleFromUrl('https://en.m.wikipedia.org/wiki/Rumours_(album)?x=1#Reception')).toBe('Rumours_(album)');
    expect(titleFromUrl('https://example.com/')).toBeNull();
  });
  it('returns nothing for an article with no reception section or scores', () => {
    expect(receptionText('<h2 id="History">History</h2><p>Long enough paragraph about the history of something unrelated to reviews entirely.</p>')).toBeNull();
    expect(ratingTables('<table data-mw=\'{"parts":[{"template":{"target":{"wt":"Infobox album"},"params":{}}}]}\'></table>')).toEqual([]);
  });
});
