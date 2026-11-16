import { describe, expect, it } from 'vitest';
import { releaseIdFrom, shapeArtwork, shapePhotos } from '../src/enrich/artwork';

describe('album artwork from the Cover Art Archive', () => {
  const R = '76df3287-6cda-33eb-8e9a-044b5e15ffdd';
  const img = (id: number, types: string[], over: any = {}) => ({ types, image: `http://coverartarchive.org/release/${R}/${id}.jpg`, comment: '', approved: true, thumbnails: { 250: `http://coverartarchive.org/release/${R}/${id}-250.jpg`, 500: `http://coverartarchive.org/release/${R}/${id}-500.jpg`, 1200: `http://coverartarchive.org/release/${R}/${id}-1200.jpg` }, ...over });
  const pictures = shapeArtwork({ images: [img(1, ['Medium']), img(2, ['Booklet'], { comment: 'page 2' }), img(3, ['Back']), img(4, ['Front']), img(5, ['Front', 'Booklet']), img(6, ['Poster']), img(7, ['Booklet'], { approved: false })] }, R);

  it('orders front, back, booklet, poster, then the disc, and names each', () => {
    expect(pictures.map((p) => p.label)).toEqual(['Front cover', 'Booklet', 'Back cover', 'Booklet · page 2', 'Poster', 'Disc']);
  });
  it('uses secure addresses and a screen-filling size, and skips unapproved images', () => {
    expect(pictures).toHaveLength(6);
    for (const p of pictures) {
      expect(p.thumb.startsWith('https://')).toBe(true);
      expect(p.full).toMatch(/^https:.*-1200\.jpg$/);
      expect(p.link).toBe(`https://musicbrainz.org/release/${R}/cover-art`);
    }
  });
  it('finds the release from the link album info already carries', () => {
    expect(releaseIdFrom([{ label: 'Wikipedia', url: 'x' }, { label: 'MusicBrainz', url: `https://musicbrainz.org/release/${R}` }])).toBe(R);
    expect(releaseIdFrom([{ label: 'Wikipedia', url: 'x' }])).toBeNull();
    expect(shapeArtwork({}, R)).toEqual([]);
  });
});

describe('photos from a Wikipedia article', () => {
  const src = (file: string, px: number) => `//thumb.wikimedia.org/wikipedia/commons/thumb/a/a1/${file}/${px}px-${file}?utm_source=en.wikipedia.org`;
  const item = (title: string, over: any = {}) => ({ title, leadImage: false, section_id: 1, type: 'image', showInGallery: true, srcset: [{ src: src(title.slice(5), 500), scale: '1x' }, { src: src(title.slice(5), 1280), scale: '2x' }], ...over });
  const photos = shapePhotos({ items: [
    item('File:Band_live_2012.jpg'),
    item('File:School.jpg', { caption: { html: '<a>Abingdon School</a>, where they formed', text: 'Abingdon School, where they formed[7]' } }),
    item('File:Curfew_advert.jpg', { srcset: [{ src: src('Curfew_advert.jpg', 500), scale: '1x' }] }),
    item('File:Sound_icon.svg', { srcset: [{ src: src('Sound_icon.svg', 60) + '.png', scale: '1x' }] }),
    item('File:Tiny_flag.png', { srcset: [{ src: src('Tiny_flag.png', 40), scale: '1x' }] }),
    { title: 'File:Creep_sample.ogg', type: 'audio', showInGallery: false },
    item('File:Hidden.jpg', { showInGallery: false }),
  ] });

  it('keeps photographs and drops icons, logos, sound files and hidden images', () => {
    expect(photos.map((p) => p.label)).toEqual(['Band live 2012', 'Abingdon School, where they formed', 'Curfew advert']);
  });
  it('uses the caption without footnote marks, the larger size for viewing, and links to the file page for credit', () => {
    expect(photos[0].thumb).toMatch(/^https:\/\/thumb\.wikimedia\.org\/.*\/500px-/);
    expect(photos[0].full).toMatch(/\/1280px-/);
    expect(photos[2].full).toMatch(/\/500px-/);
    expect(photos[1].link).toBe('https://commons.wikimedia.org/wiki/File%3ASchool.jpg');
    expect(shapePhotos({})).toEqual([]);
  });
});

describe('gig posters from the Event Art Archive', () => {
  it('lists an artist’s gigs most recent first, undated last', async () => {
    const { gigsFrom } = await import('../src/enrich/posters');
    const gigs = gigsFrom({ events: [{ id: 'a', name: 'Old show', 'life-span': { begin: '1998-04-06' } }, { id: 'b', name: 'Undated' }, { id: 'c', name: 'New show', 'life-span': { begin: '2016-08-11' } }, { name: 'no id' }] });
    expect(gigs.map((g) => g.id)).toEqual(['c', 'a', 'b']);
    expect(gigsFrom({})).toEqual([]);
  });
  it('labels each picture with its gig and year, and says when it is a flyer or ticket', async () => {
    const { shapeEventArt } = await import('../src/enrich/posters');
    const gig = { id: '9a39f040-d094-4d40-8dd8-bc5683913f8c', name: 'Night of the Prog Festival XIV', date: '2019-07-19' };
    const img = (types: string[], over: any = {}) => ({ types, image: 'http://eventartarchive.org/event/x/1.jpg', approved: true, thumbnails: { 500: 'http://eventartarchive.org/event/x/1-500.jpg', 1200: 'http://eventartarchive.org/event/x/1-1200.jpg' }, ...over });
    const pictures = shapeEventArt({ images: [img(['Poster']), img(['Ticket']), img(['Flyer'], { approved: false })] }, gig);
    expect(pictures.map((p) => p.label)).toEqual(['Night of the Prog Festival XIV · 2019', 'Ticket · Night of the Prog Festival XIV · 2019']);
    expect(pictures[0]).toMatchObject({ thumb: 'https://eventartarchive.org/event/x/1-500.jpg', full: 'https://eventartarchive.org/event/x/1-1200.jpg', source: 'Event Art Archive', link: `https://musicbrainz.org/event/${gig.id}` });
    expect(shapeEventArt({}, gig)).toEqual([]);
  });
});
