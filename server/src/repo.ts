import { asc, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { ROLES, type Role } from './db/schema';
import { poolLimits } from './settings';

const { teams, players, playerChampions, champions, comps, compSlots, compAlternatives, poolHistory } = schema;

export class HttpError extends Error {
  constructor(
    public status: 400 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export type PoolEntry = { championId: string; tier: 'top' | 'comp'; priority: number; notes?: string | null };

// ---------- Equipos ----------

export function listTeams() {
  return db
    .select({
      id: teams.id,
      name: teams.name,
      shortName: teams.shortName,
      faculty: teams.faculty,
      isOwn: teams.isOwn,
      notes: teams.notes,
      createdAt: teams.createdAt,
      playerCount: sql<number>`(select count(*) from players p where p.team_id = "teams"."id")`,
    })
    .from(teams)
    .orderBy(sql`${teams.isOwn} desc`, asc(teams.name))
    .all();
}

export function getTeam(id: number) {
  const team = db.select().from(teams).where(eq(teams.id, id)).get();
  if (!team) throw new HttpError(404, 'Equipo no encontrado');
  return { ...team, players: listPlayers(id) };
}

export function ownTeam() {
  return db.select().from(teams).where(eq(teams.isOwn, true)).get();
}

type TeamInput = { name?: string; shortName?: string | null; faculty?: string | null; notes?: string | null };

export function createTeam(input: TeamInput) {
  const name = input.name?.trim();
  if (!name) throw new HttpError(400, 'El nombre es obligatorio');
  try {
    return db
      .insert(teams)
      .values({ name, shortName: input.shortName || null, faculty: input.faculty || null, notes: input.notes || null })
      .returning()
      .get();
  } catch (e) {
    throw uniqueError(e, 'Ya existe un equipo con ese nombre');
  }
}

export function updateTeam(id: number, input: TeamInput) {
  getTeam(id);
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new HttpError(400, 'El nombre es obligatorio');
  try {
    return db
      .update(teams)
      .set({
        ...(name ? { name } : {}),
        ...(input.shortName !== undefined ? { shortName: input.shortName || null } : {}),
        ...(input.faculty !== undefined ? { faculty: input.faculty || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      })
      .where(eq(teams.id, id))
      .returning()
      .get();
  } catch (e) {
    throw uniqueError(e, 'Ya existe un equipo con ese nombre');
  }
}

export function deleteTeam(id: number) {
  const team = getTeam(id);
  if (team.isOwn) throw new HttpError(409, 'No se puede borrar el equipo propio');
  db.delete(teams).where(eq(teams.id, id)).run();
}

// ---------- Jugadores y pools ----------

function poolsFor(playerIds: number[]) {
  if (!playerIds.length) return new Map<number, ReturnType<typeof poolRows>>();
  const rows = poolRows(playerIds);
  const map = new Map<number, typeof rows>();
  for (const r of rows) {
    if (!map.has(r.playerId)) map.set(r.playerId, []);
    map.get(r.playerId)!.push(r);
  }
  return map;
}

function poolRows(playerIds: number[]) {
  return db
    .select({
      playerId: playerChampions.playerId,
      championId: playerChampions.championId,
      tier: playerChampions.tier,
      priority: playerChampions.priority,
      notes: playerChampions.notes,
    })
    .from(playerChampions)
    .where(inArray(playerChampions.playerId, playerIds))
    // top primero, después comp; dentro de cada tier por prioridad
    .orderBy(sql`case ${playerChampions.tier} when 'top' then 0 else 1 end`, asc(playerChampions.priority))
    .all();
}

const roleOrder = sql`case ${players.role} when 'TOP' then 0 when 'JG' then 1 when 'MID' then 2 when 'ADC' then 3 else 4 end`;

export function listPlayers(teamId?: number) {
  const rows = db
    .select()
    .from(players)
    .where(teamId ? eq(players.teamId, teamId) : undefined)
    .orderBy(roleOrder, asc(players.id))
    .all();
  const pools = poolsFor(rows.map((p) => p.id));
  return rows.map((p) => ({
    ...p,
    pool: (pools.get(p.id) ?? []).map(({ playerId: _, ...rest }) => rest),
  }));
}

export function getPlayer(id: number) {
  const p = db.select().from(players).where(eq(players.id, id)).get();
  if (!p) throw new HttpError(404, 'Jugador no encontrado');
  return listPlayers(p.teamId).find((x) => x.id === id)!;
}

type PlayerInput = { name?: string; role?: string; aliases?: string | null; riotId?: string | null; active?: boolean };

function checkRole(role: unknown): Role {
  if (!ROLES.includes(role as Role)) throw new HttpError(400, `Rol inválido. Usar: ${ROLES.join(', ')}`);
  return role as Role;
}

export function createPlayer(teamId: number, input: PlayerInput) {
  getTeam(teamId);
  const name = input.name?.trim();
  if (!name) throw new HttpError(400, 'El nombre es obligatorio');
  try {
    const p = db
      .insert(players)
      .values({
        teamId,
        name,
        role: checkRole(input.role),
        aliases: input.aliases || null,
        riotId: input.riotId || null,
        active: input.active ?? true,
      })
      .returning()
      .get();
    return getPlayer(p.id);
  } catch (e) {
    throw uniqueError(e, 'Ya hay un jugador con ese nombre en el equipo');
  }
}

export function updatePlayer(id: number, input: PlayerInput) {
  getPlayer(id);
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new HttpError(400, 'El nombre es obligatorio');
  try {
    db.update(players)
      .set({
        ...(name ? { name } : {}),
        ...(input.role !== undefined ? { role: checkRole(input.role) } : {}),
        ...(input.aliases !== undefined ? { aliases: input.aliases || null } : {}),
        ...(input.riotId !== undefined ? { riotId: input.riotId || null } : {}),
        ...(input.active !== undefined ? { active: !!input.active } : {}),
      })
      .where(eq(players.id, id))
      .run();
  } catch (e) {
    throw uniqueError(e, 'Ya hay un jugador con ese nombre en el equipo');
  }
  return getPlayer(id);
}

export function deletePlayer(id: number) {
  getPlayer(id);
  db.delete(players).where(eq(players.id, id)).run();
}

export function replacePool(playerId: number, entries: PoolEntry[], snapshotNote?: string | null) {
  getPlayer(playerId);
  if (!Array.isArray(entries)) throw new HttpError(400, 'Se esperaba una lista de campeones');
  const { maxTop, maxComp } = poolLimits();

  const seen = new Set<string>();
  for (const e of entries) {
    if (e.tier !== 'top' && e.tier !== 'comp') throw new HttpError(400, `Tier inválido para ${e.championId}`);
    if (seen.has(e.championId)) throw new HttpError(400, `${e.championId} está repetido en el pool`);
    seen.add(e.championId);
  }
  const top = entries.filter((e) => e.tier === 'top');
  const comp = entries.filter((e) => e.tier === 'comp');
  if (top.length > maxTop) throw new HttpError(400, `Máximo ${maxTop} campeones en el Top`);
  if (comp.length > maxComp) throw new HttpError(400, `Máximo ${maxComp} complementarios`);

  const known = new Set(
    entries.length
      ? db
          .select({ id: champions.id })
          .from(champions)
          .where(inArray(champions.id, [...seen]))
          .all()
          .map((c) => c.id)
      : [],
  );
  const unknown = [...seen].filter((id) => !known.has(id));
  if (unknown.length) throw new HttpError(400, `Campeones desconocidos: ${unknown.join(', ')}`);

  // Normaliza prioridades a 1..N respetando el orden recibido
  const sorted = (list: PoolEntry[]) => [...list].sort((a, b) => a.priority - b.priority);
  const normalized = [
    ...sorted(top).map((e, i) => ({ ...e, priority: i + 1 })),
    ...sorted(comp).map((e, i) => ({ ...e, priority: i + 1 })),
  ];

  db.transaction((tx) => {
    tx.delete(playerChampions).where(eq(playerChampions.playerId, playerId)).run();
    for (const e of normalized) {
      tx.insert(playerChampions)
        .values({ playerId, championId: e.championId, tier: e.tier, priority: e.priority, notes: e.notes ?? null })
        .run();
    }
    if (snapshotNote !== undefined && snapshotNote !== null) {
      tx.insert(poolHistory)
        .values({ playerId, snapshotJson: normalized, note: snapshotNote || null })
        .run();
    }
  });
  return getPlayer(playerId);
}

export function playerHistory(playerId: number) {
  getPlayer(playerId);
  return db
    .select()
    .from(poolHistory)
    .where(eq(poolHistory.playerId, playerId))
    .orderBy(sql`${poolHistory.createdAt} desc`)
    .all();
}

// ---------- Comps ----------

export type CompInput = {
  name?: string;
  style?: string;
  gamePlan?: string | null;
  keyPoint?: string | null;
  active?: boolean;
  slots?: { role: Role; playerId: number | null; championId: string | null }[];
  alternatives?: { role: Role; championId: string; priority?: number }[];
};

export function listComps() {
  const all = db.select().from(comps).orderBy(asc(comps.id)).all();
  const slots = db.select().from(compSlots).all();
  const alts = db.select().from(compAlternatives).orderBy(asc(compAlternatives.priority)).all();
  return all.map((c) => ({
    ...c,
    slots: ROLES.map((role) => {
      const s = slots.find((x) => x.compId === c.id && x.role === role);
      return {
        role,
        playerId: s?.playerId ?? null,
        championId: s?.championId ?? null,
        alternatives: alts.filter((a) => a.compId === c.id && a.role === role).map((a) => a.championId),
      };
    }),
  }));
}

function getComp(id: number) {
  const c = listComps().find((x) => x.id === id);
  if (!c) throw new HttpError(404, 'Comp no encontrada');
  return c;
}

function writeCompChildren(compId: number, input: CompInput) {
  db.delete(compSlots).where(eq(compSlots.compId, compId)).run();
  db.delete(compAlternatives).where(eq(compAlternatives.compId, compId)).run();
  for (const s of input.slots ?? []) {
    checkRole(s.role);
    db.insert(compSlots)
      .values({ compId, role: s.role, playerId: s.playerId ?? null, championId: s.championId || null })
      .run();
  }
  const altCount: Record<string, number> = {};
  for (const a of input.alternatives ?? []) {
    checkRole(a.role);
    altCount[a.role] = (altCount[a.role] ?? 0) + 1;
    db.insert(compAlternatives)
      .values({ compId, role: a.role, championId: a.championId, priority: a.priority ?? altCount[a.role] })
      .onConflictDoNothing()
      .run();
  }
}

export function createComp(input: CompInput) {
  const name = input.name?.trim();
  if (!name) throw new HttpError(400, 'El nombre es obligatorio');
  const id = db.transaction(() => {
    const c = db
      .insert(comps)
      .values({
        name,
        style: input.style || 'otro',
        gamePlan: input.gamePlan || null,
        keyPoint: input.keyPoint || null,
        active: input.active ?? true,
      })
      .returning()
      .get();
    writeCompChildren(c.id, input);
    return c.id;
  });
  return getComp(id);
}

export function updateComp(id: number, input: CompInput) {
  getComp(id);
  const name = input.name?.trim();
  if (input.name !== undefined && !name) throw new HttpError(400, 'El nombre es obligatorio');
  db.transaction(() => {
    db.update(comps)
      .set({
        ...(name ? { name } : {}),
        ...(input.style !== undefined ? { style: input.style || 'otro' } : {}),
        ...(input.gamePlan !== undefined ? { gamePlan: input.gamePlan || null } : {}),
        ...(input.keyPoint !== undefined ? { keyPoint: input.keyPoint || null } : {}),
        ...(input.active !== undefined ? { active: !!input.active } : {}),
        updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      })
      .where(eq(comps.id, id))
      .run();
    if (input.slots || input.alternatives) writeCompChildren(id, input);
  });
  return getComp(id);
}

export function deleteComp(id: number) {
  getComp(id);
  db.delete(comps).where(eq(comps.id, id)).run();
}

// ---------- Drafts ----------

export function listDrafts(rivalTeamId?: number) {
  return db
    .select()
    .from(schema.drafts)
    .where(rivalTeamId ? eq(schema.drafts.rivalTeamId, rivalTeamId) : undefined)
    .orderBy(sql`${schema.drafts.createdAt} desc`)
    .all();
}

export function createDraft(input: {
  side: 'blue' | 'red';
  rivalTeamId?: number | null;
  ownLineup: unknown;
  rivalLineup?: unknown;
  actions: unknown;
  result?: string | null;
  notes?: string | null;
}) {
  const own = ownTeam();
  if (!own) throw new HttpError(409, 'No hay equipo propio cargado');
  if (input.side !== 'blue' && input.side !== 'red') throw new HttpError(400, 'Lado inválido');
  return db
    .insert(schema.drafts)
    .values({
      side: input.side,
      ownTeamId: own.id,
      rivalTeamId: input.rivalTeamId ?? null,
      ownLineupJson: input.ownLineup ?? {},
      rivalLineupJson: input.rivalLineup ?? null,
      actionsJson: input.actions ?? [],
      result: input.result || null,
      notes: input.notes || null,
    })
    .returning()
    .get();
}

export function deleteDraft(id: number) {
  db.delete(schema.drafts).where(eq(schema.drafts.id, id)).run();
}

// ---------- utilidades ----------

function uniqueError(e: unknown, message: string) {
  if (e instanceof Error && /UNIQUE constraint failed/.test(e.message)) return new HttpError(409, message);
  return e;
}

