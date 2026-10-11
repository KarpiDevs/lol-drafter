import { eq } from 'drizzle-orm';
import { db, schema } from './db';

const DEFAULTS: Record<string, string> = {
  max_top: process.env.MAX_TOP ?? '5',
  max_comp: process.env.MAX_COMP ?? '3',
};

export function getSetting(key: string): string | undefined {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return row?.value ?? DEFAULTS[key];
}

export function setSetting(key: string, value: string) {
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}

export function poolLimits() {
  return {
    maxTop: Number(getSetting('max_top')),
    maxComp: Number(getSetting('max_comp')),
  };
}
