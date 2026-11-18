// One shared connection to the database, and the tables every sync needs.
import pg from 'pg';
import { SCHEMA as NOTES_SCHEMA } from './notes.js';
import { SCHEMA as SHOWS_SCHEMA } from './shows.js';
import { SCHEMA as TAG_SCHEMA } from './tags.js';

let pool;
let ready;

/** The database, or null when none is set up. `ready` resolves once the tables exist. */
export function database() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;
  if (!pool) {
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    pool = new pg.Pool({ connectionString: url, max: 2, ssl: local ? false : { rejectUnauthorized: true } });
    ready = pool.query(NOTES_SCHEMA).then(() => pool.query(TAG_SCHEMA)).then(() => pool.query(SHOWS_SCHEMA));
  }
  return { db: pool, ready };
}
