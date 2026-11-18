import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS server module
import { setupStatus } from '../api/_lib/setup.js';
import { countOn, deployUrl, EXTRAS } from '../src/setup';

describe('setup status', () => {
  it('reports everything off for an empty environment', () => {
    const s = setupStatus({});
    expect(Object.values(s).every((v) => v === false)).toBe(true);
    expect(countOn(s)).toBe(0);
  });

  it('reports what is on, and never echoes a key', () => {
    const s = setupStatus({ GENIUS_ACCESS_TOKEN: 'g-secret', DATABASE_URL: 'postgres://u:p@h/d', CLAUDE_API_KEY: ' "sk-ant-secret" ', AI_ALLOWED_USERS: 'me', YOUTUBE_API_KEY: '   ' });
    expect(s).toEqual({ genius: true, lastfm: false, youtube: false, concerts: false, setlists: false, sync: true, photos: false, ai: true, aiNamedOnly: true });
    expect(JSON.stringify(s)).not.toMatch(/secret|postgres/);
    expect(countOn(s)).toBe(3);
  });

  it('counts a Blob store connected by token or by id, but only with a database', () => {
    expect(setupStatus({ BLOB_STORE_ID: 'store_x', DATABASE_URL: 'x' }).photos).toBe(true);
    expect(setupStatus({ BLOB_READ_WRITE_TOKEN: 't', POSTGRES_URL: 'x' }).photos).toBe(true);
    expect(setupStatus({ BLOB_READ_WRITE_TOKEN: 't' }).photos).toBe(false);
  });

  it('has an entry in the app for every service the server reports', () => {
    const ids = EXTRAS.map((e) => e.id).sort();
    expect(ids).toEqual(Object.keys(setupStatus({})).filter((k) => k !== 'aiNamedOnly').sort());
  });

  it('builds a one-click copy link for a repository', () => {
    expect(deployUrl('https://github.com/someone/magic-spells')).toBe('https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsomeone%2Fmagic-spells&project-name=magic-spells&repository-name=magic-spells');
  });
});
