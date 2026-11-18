import { useState } from 'react';
import { ChevronLeft } from './Icons';
import { go } from '../lib/router';
import { useData } from '../lib/useData';
import { fetchNews, timeAgo, yoursFirst, type NewsItem } from '../news';
import * as api from '../spotify/api';

function NewsCard({ item }: { item: NewsItem }) {
  const [broken, setBroken] = useState(false);
  return (
    <a className="news-card" href={item.link} target="_blank" rel="noreferrer">
      <span className="news-thumb">
        {item.image && !broken ? <img src={item.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : <span className="news-blank">{item.source}</span>}
        {item.about && <span className="news-yours">Your artist</span>}
      </span>
      <span className="card-title">{item.title}</span>
      <span className="card-sub">{item.source} · {timeAgo(item.at)}</span>
    </a>
  );
}

function useNews() {
  const feed = useData('news', fetchNews);
  const artists = useData('home:topArtists', api.topArtists);
  const names = (artists.data?.items || []).map((a) => a.name);
  return {
    loading: feed.loading,
    news: yoursFirst(feed.data?.news || [], names),
    reviews: yoursFirst(feed.data?.reviews || [], names),
  };
}

/** News and reviews at the top of Home. Left out entirely when the feeds can't be reached. */
export function NewsShelves() {
  const { news, reviews } = useNews();
  if (!news.length && !reviews.length) return null;
  return (
    <>
      {news.length > 0 && (
        <section className="shelf news">
          <h2><button className="shelf-more" onClick={() => go('/news')}>Music news <span>See all</span></button></h2>
          <div className="shelf-scroll">{news.slice(0, 12).map((n) => <NewsCard key={n.link} item={n} />)}</div>
        </section>
      )}
      {reviews.length > 0 && (
        <section className="shelf news">
          <h2><button className="shelf-more" onClick={() => go('/news/reviews')}>New album reviews <span>See all</span></button></h2>
          <div className="shelf-scroll">{reviews.slice(0, 12).map((n) => <NewsCard key={n.link} item={n} />)}</div>
        </section>
      )}
    </>
  );
}

/** Everything in the feeds as a list, with the summary each publication gives. */
export function NewsView({ tab }: { tab?: string }) {
  const { news, reviews, loading } = useNews();
  const showing = tab === 'reviews' ? 'reviews' : 'news';
  const items = showing === 'reviews' ? reviews : news;
  return (
    <div className="page">
      <header className="page-head">
        <button className="icon-btn back-inline" onClick={() => window.history.back()} aria-label="Back"><ChevronLeft /></button>
        <h1>News &amp; reviews</h1>
      </header>
      <div className="segments">
        <button className={showing === 'news' ? 'on' : ''} onClick={() => window.location.replace('#/news')}>News</button>
        <button className={showing === 'reviews' ? 'on' : ''} onClick={() => window.location.replace('#/news/reviews')}>Reviews</button>
      </div>
      {loading && !items.length && <p className="fineprint">Loading…</p>}
      {!loading && !items.length && <p className="fineprint">The news feeds can’t be reached right now.</p>}
      <div className="news-list">
        {items.map((n) => (
          <a key={n.link} className="news-row" href={n.link} target="_blank" rel="noreferrer">
            {n.image && <img src={n.image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />}
            <span className="row-text">
              <span className="row-title">{n.title}</span>
              {n.summary && <span className="row-sub">{n.summary}</span>}
              <span className="row-sub news-meta">{n.about && <b>Your artist · </b>}{n.source} · {timeAgo(n.at)}</span>
            </span>
          </a>
        ))}
      </div>
      {items.length > 0 && <p className="fineprint">Headlines from each publication’s own feed. Tapping one opens the article on their site.</p>}
    </div>
  );
}
