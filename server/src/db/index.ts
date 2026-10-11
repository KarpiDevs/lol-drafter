import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = resolve(here, '../../..');
export const DB_PATH = process.env.DB_PATH ?? resolve(ROOT_DIR, 'data/draft.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

export const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export function runMigrations() {
  migrate(db, { migrationsFolder: resolve(here, '../../drizzle') });
}

export { schema };
