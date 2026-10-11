import { sql } from 'drizzle-orm';
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUPP'] as const;
export type Role = (typeof ROLES)[number];

export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  shortName: text('short_name'),
  faculty: text('faculty'),
  isOwn: integer('is_own', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(now),
});

export const players = sqliteTable(
  'players',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role').$type<Role>().notNull(),
    aliases: text('aliases'),
    riotId: text('riot_id'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [uniqueIndex('players_team_name_uq').on(t.teamId, t.name)],
);

export const champions = sqliteTable('champions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  nameEn: text('name_en'),
  image: text('image').notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default(sql`'[]'`),
});

export const playerChampions = sqliteTable(
  'player_champions',
  {
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    championId: text('champion_id')
      .notNull()
      .references(() => champions.id),
    tier: text('tier').$type<'top' | 'comp'>().notNull(),
    priority: integer('priority').notNull(),
    notes: text('notes'),
    updatedAt: text('updated_at').notNull().default(now),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.championId] })],
);

export const poolHistory = sqliteTable('pool_history', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: integer('player_id')
    .notNull()
    .references(() => players.id, { onDelete: 'cascade' }),
  snapshotJson: text('snapshot_json', { mode: 'json' }).notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull().default(now),
});

export const comps = sqliteTable('comps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  style: text('style').notNull().default('otro'),
  gamePlan: text('game_plan'),
  keyPoint: text('key_point'),
  active: integer('active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default(now),
  updatedAt: text('updated_at').notNull().default(now),
});

export const compSlots = sqliteTable(
  'comp_slots',
  {
    compId: integer('comp_id')
      .notNull()
      .references(() => comps.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull(),
    playerId: integer('player_id').references(() => players.id, { onDelete: 'set null' }),
    championId: text('champion_id').references(() => champions.id),
  },
  (t) => [primaryKey({ columns: [t.compId, t.role] })],
);

export const compAlternatives = sqliteTable(
  'comp_alternatives',
  {
    compId: integer('comp_id')
      .notNull()
      .references(() => comps.id, { onDelete: 'cascade' }),
    role: text('role').$type<Role>().notNull(),
    championId: text('champion_id')
      .notNull()
      .references(() => champions.id),
    priority: integer('priority').notNull(),
  },
  (t) => [primaryKey({ columns: [t.compId, t.role, t.championId] })],
);

export const drafts = sqliteTable('drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  side: text('side').$type<'blue' | 'red'>().notNull(),
  ownTeamId: integer('own_team_id')
    .notNull()
    .references(() => teams.id, { onDelete: 'cascade' }),
  rivalTeamId: integer('rival_team_id').references(() => teams.id, { onDelete: 'set null' }),
  ownLineupJson: text('own_lineup_json', { mode: 'json' }).notNull(),
  rivalLineupJson: text('rival_lineup_json', { mode: 'json' }),
  actionsJson: text('actions_json', { mode: 'json' }).notNull(),
  result: text('result'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default(now),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
