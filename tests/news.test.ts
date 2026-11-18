import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS server module
import { decode, mergeNews, parseFeed, plain } from '../api/_lib/news.js';
import { timeAgo, yoursFirst, type NewsItem } from '../src/news';

const FEED = `<?xml version="1.0"?><rss><channel><title>Site</title>
<item><title>U2 &#8211; &#8216;Carnaval&#8217; review: brighter &amp; poppier</title><link>https://example.com/a</link>
<pubDate>Thu, 12 Nov 2026 09:00:00 +0000</pubDate>
<description><![CDATA[<p><img width="2000" src="https://example.com/u2.jpg" class="x" /></p><p>On their 16th album, the band sound <b>playful</b>.</p><p>The post <a href="#">U2</a> appeared first on <a href="#">Site</a>.</p>]]></description></item>
<item><title>Legendary Love</title><link>https://example.com/b</link><pubDate>Tue, 17 Nov 2026 05:03:00 +0000</pubDate>
<description>A set of slinky R&amp;B compositions.</description><media:thumbnail url="https://example.com/love.jpg" width="5"/></item>
<item><title>No date</title><link>https://example.com/c</link><pubDate></pubDate></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Tue, 17 Nov 2026 05:03:00 +0000</pubDate></item>
<item><title><![CDATA[Plain one]]></title><link>https://example.com/d</link><pubDate>Mon, 16 Nov 2026 08:47:40 -0500</pubDate><media:thumbnail url="http://insecure.example/x.jpg"/></item>
</channel></rss>`;

describe('news feeds', () => {
  it('decodes the entities feeds use', () => {
    expect(decode('R&amp;B &#8216;x&#8217; &#x2014; &hellip; &unknown;')).toBe('R&B ‘x’ — … &unknown;');
  });

  it('turns a description into a short plain summary', () => {
    expect(plain('<p>One <b>two</b></p>\n<p>three</p>')).toBe('One two three');
    expect(plain('word '.repeat(80)).length).toBeLessThanOrEqual(181);
    expect(plain('word '.repeat(80)).endsWith('…')).toBe(true);
  });

  it('reads headlines, pictures and summaries, and skips broken entries', () => {
    const items = parseFeed(FEED, { source: 'Site', kind: 'review' });
    expect(items.map((i: NewsItem) => i.link)).toEqual(['https://example.com/a', 'https://example.com/b', 'https://example.com/d']);
    expect(items[0]).toMatchObject({ title: 'U2 – ‘Carnaval’ review: brighter & poppier', source: 'Site', kind: 'review', image: 'https://example.com/u2.jpg', summary: 'On their 16th album, the band sound playful.' });
    expect(items[0].at).toBe(Date.parse('2026-11-12T09:00:00Z'));
    expect(items[1]).toMatchObject({ image: 'https://example.com/love.jpg', summary: 'A set of slinky R&B compositions.' });
    expect(items[2]).toMatchObject({ title: 'Plain one', image: '' });
    expect(parseFeed('<html>blocked</html>', { source: 'x', kind: 'news' })).toEqual([]);
  });

  it('merges newest first without letting one site take over', () => {
    const now = Date.parse('2026-11-18T00:00:00Z');
    const item = (source: string, n: number, hoursAgo: number) => ({ title: `${source} ${n}`, link: `https://${source}/${n}`, source, kind: 'news', at: now - hoursAgo * 3_600_000, image: '', summary: '' });
    const busy = Array.from({ length: 10 }, (_, n) => item('busy', n, n));
    const merged = mergeNews([...busy, item('quiet', 1, 30), item('quiet', 1, 30), item('stale', 1, 24 * 90), item('future', 1, -48)], { limit: 30, perSource: 3, now });
    expect(merged.map((i: NewsItem) => i.title)).toEqual(['busy 0', 'busy 1', 'busy 2', 'quiet 1']);
    expect(mergeNews(busy, { limit: 2, perSource: 9, now })).toHaveLength(2);
  });
});

describe('news on the Home screen', () => {
  const n = (title: string, at = 0): NewsItem => ({ title, link: title, source: 's', kind: 'news', at, image: '', summary: '' });

  it('puts headlines about your artists first, keeping order otherwise', () => {
    const out = yoursFirst([n('Festival line-ups'), n('Björk announces tour'), n('Air conditioning news'), n('New from The National: a film')], ['Bjork', 'Air', 'The National']);
    expect(out.map((i) => [i.title, i.about])).toEqual([
      ['Björk announces tour', 'Bjork'],
      ['New from The National: a film', 'The National'],
      ['Festival line-ups', undefined],
      ['Air conditioning news', undefined],
    ]);
  });

  it('does not match a name inside a longer word', () => {
    expect(yoursFirst([n('Wireless festival returns')], ['Wire'])[0].about).toBeUndefined();
  });

  it('says how long ago', () => {
    const now = Date.parse('2026-11-18T12:00:00Z');
    expect(timeAgo(now - 30_000, now)).toBe('just now');
    expect(timeAgo(now - 25 * 60_000, now)).toBe('25m ago');
    expect(timeAgo(now - 5 * 3_600_000, now)).toBe('5h ago');
    expect(timeAgo(now - 3 * 86_400_000, now)).toBe('3d ago');
  });
});
