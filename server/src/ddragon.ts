import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { db, schema, ROOT_DIR } from './db';
import { getSetting, setSetting } from './settings';

const BASE = 'https://ddragon.leagueoflegends.com';
const LOCALES = ['es_AR', 'es_ES', 'es_MX'];

export const IMG_DIR = process.env.IMG_DIR ?? resolve(ROOT_DIR, 'data/champions');

type DDChampion = { id: string; name: string; image: { full: string }; tags: string[] };

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} al pedir ${url}`);
  return (await res.json()) as T;
}

async function fetchChampionData(version: string, locale: string) {
  const json = await getJson<{ data: Record<string, DDChampion> }>(
    `${BASE}/cdn/${version}/data/${locale}/champion.json`,
  );
  return Object.values(json.data);
}

export function ddragonVersion() {
  return getSetting('ddragon_version');
}

export function championImageUrl(file: string, version = ddragonVersion()) {
  return `${BASE}/cdn/${version}/img/champion/${file}`;
}

/** Baja la lista de campeones de Data Dragon y la guarda en la tabla champions. */
export async function syncChampions(opts: { downloadImages?: boolean } = {}) {
  const [version] = await getJson<string[]>(`${BASE}/api/versions.json`);

  let localized: DDChampion[] | undefined;
  let usedLocale = '';
  for (const locale of LOCALES) {
    try {
      localized = await fetchChampionData(version, locale);
      usedLocale = locale;
      break;
    } catch {
      // probar el siguiente locale
    }
  }
  const english = await fetchChampionData(version, 'en_US');
  if (!localized) {
    localized = english;
    usedLocale = 'en_US';
  }
  const enById = new Map(english.map((c) => [c.id, c.name]));

  db.transaction((tx) => {
    for (const c of localized!) {
      const row = {
        id: c.id,
        name: c.name,
        nameEn: enById.get(c.id) ?? c.name,
        image: c.image.full,
        tags: c.tags,
      };
      tx.insert(schema.champions)
        .values(row)
        .onConflictDoUpdate({
          target: schema.champions.id,
          set: { name: sql`excluded.name`, nameEn: sql`excluded.name_en`, image: sql`excluded.image`, tags: sql`excluded.tags` },
        })
        .run();
    }
  });
  setSetting('ddragon_version', version);

  let downloaded = 0;
  if (opts.downloadImages) {
    for (const c of localized) {
      if (await cacheImage(c.image.full, version)) downloaded++;
    }
  }

  return { version, locale: usedLocale, count: localized.length, downloaded };
}

/** Guarda el PNG en disco si todavía no está. Devuelve true si lo descargó. */
export async function cacheImage(file: string, version = ddragonVersion()) {
  mkdirSync(IMG_DIR, { recursive: true });
  const path = resolve(IMG_DIR, file);
  if (existsSync(path)) return false;
  const res = await fetch(championImageUrl(file, version));
  if (!res.ok) throw new Error(`No se pudo bajar ${file}: ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return true;
}

export function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Crea un resolvedor de nombres (español, inglés o id de DDragon) contra la tabla champions. */
export function championResolver() {
  const all = db.select().from(schema.champions).all();
  const exact = new Map<string, string>();
  for (const c of all) {
    for (const key of [c.id, c.name, c.nameEn ?? '']) {
      if (key) exact.set(normalize(key), c.id);
    }
  }
  return (input: string): string | undefined => {
    const n = normalize(input);
    if (!n) return undefined;
    const hit = exact.get(n);
    if (hit) return hit;
    // "Nunu" → "Nunu y Willump", "Renata" → "Renata Glasc"
    const prefix = all.filter(
      (c) => normalize(c.name).startsWith(n) || normalize(c.nameEn ?? '').startsWith(n),
    );
    return prefix.length === 1 ? prefix[0].id : undefined;
  };
}
