import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export const ROLES = ['TOP', 'JG', 'MID', 'ADC', 'SUPP'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = { TOP: 'Top', JG: 'Jungla', MID: 'Mid', ADC: 'ADC', SUPP: 'Support' };

export type Tier = 'top' | 'comp';
export type PoolEntry = { championId: string; tier: Tier; priority: number; notes?: string | null };

export type Champion = { id: string; name: string; nameEn: string | null; image: string; tags: string[] };

export type Player = {
  id: number;
  teamId: number;
  name: string;
  role: Role;
  aliases: string | null;
  riotId: string | null;
  active: boolean;
  pool: PoolEntry[];
};

export type TeamSummary = {
  id: number;
  name: string;
  shortName: string | null;
  faculty: string | null;
  isOwn: boolean;
  notes: string | null;
  createdAt: string;
  playerCount: number;
};
export type Team = Omit<TeamSummary, 'playerCount'> & { players: Player[] };

export type CompSlot = { role: Role; playerId: number | null; championId: string | null; alternatives: string[] };
export type Comp = {
  id: number;
  name: string;
  style: string;
  gamePlan: string | null;
  keyPoint: string | null;
  active: boolean;
  slots: CompSlot[];
};

export type SavedDraft = {
  id: number;
  side: 'blue' | 'red';
  ownTeamId: number;
  rivalTeamId: number | null;
  ownLineupJson: Record<Role, number | null>;
  rivalLineupJson: Record<Role, number | null> | null;
  actionsJson: { championId: string | null; playerId: number | null }[];
  result: string | null;
  notes: string | null;
  createdAt: string;
};

export type PoolSnapshot = { id: number; playerId: number; snapshotJson: PoolEntry[]; note: string | null; createdAt: string };

export type Config = { maxTop: number; maxComp: number; ddragonVersion: string | null };

async function http<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  // Sesión vencida o cerrada: recargar muestra la pantalla de login
  if (res.status === 401) window.location.reload();
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => http<T>('GET', url),
  post: <T>(url: string, body?: unknown) => http<T>('POST', url, body ?? {}),
  put: <T>(url: string, body: unknown) => http<T>('PUT', url, body),
  del: (url: string) => http<void>('DELETE', url),
};

export const champIcon = (c: Pick<Champion, 'image'>) => `/api/champions/img/${c.image}`;

// ---------- queries ----------

export const useConfig = () => useQuery({ queryKey: ['config'], queryFn: () => api.get<Config>('/config') });

export const useChampions = () =>
  useQuery({
    queryKey: ['champions'],
    queryFn: () => api.get<Champion[]>('/champions'),
    staleTime: Infinity,
    select: (list) => list,
  });

export function useChampionMap() {
  const q = useChampions();
  const map = new Map<string, Champion>();
  for (const c of q.data ?? []) map.set(c.id, c);
  return map;
}

export const useTeams = () => useQuery({ queryKey: ['teams'], queryFn: () => api.get<TeamSummary[]>('/teams') });

export const useTeam = (id: number | null | undefined) =>
  useQuery({
    queryKey: ['team', id],
    queryFn: () => api.get<Team>(`/teams/${id}`),
    enabled: !!id,
  });

export function useOwnTeam() {
  const teams = useTeams();
  const ownId = teams.data?.find((t) => t.isOwn)?.id;
  return useTeam(ownId);
}

export const useComps = () => useQuery({ queryKey: ['comps'], queryFn: () => api.get<Comp[]>('/comps') });

export const useDrafts = () => useQuery({ queryKey: ['drafts'], queryFn: () => api.get<SavedDraft[]>('/drafts') });

export const usePlayerHistory = (playerId: number | null) =>
  useQuery({
    queryKey: ['history', playerId],
    queryFn: () => api.get<PoolSnapshot[]>(`/players/${playerId}/history`),
    enabled: !!playerId,
  });

/** Mutación que invalida las claves indicadas al terminar. */
export function useApiMutation<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, invalidate: unknown[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all(invalidate.map((key) => qc.invalidateQueries({ queryKey: key }))),
  });
}

// ---------- utilidades de nombres ----------

export function normalize(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Resuelve un nombre escrito a mano ("Maestro Yi", "master yi", "Nunu") a un campeón. */
export function resolveChampion(input: string, champions: Champion[]): Champion | undefined {
  const n = normalize(input);
  if (!n) return undefined;
  const exact = champions.find((c) => [c.id, c.name, c.nameEn ?? ''].some((k) => normalize(k) === n));
  if (exact) return exact;
  const prefix = champions.filter((c) => normalize(c.name).startsWith(n) || normalize(c.nameEn ?? '').startsWith(n));
  return prefix.length === 1 ? prefix[0] : undefined;
}

export function matchesSearch(c: Champion, q: string) {
  const n = normalize(q);
  return !n || normalize(c.name).includes(n) || normalize(c.nameEn ?? '').includes(n) || normalize(c.id).includes(n);
}

export const sortPool = (pool: PoolEntry[]) =>
  [...pool].sort((a, b) => (a.tier === b.tier ? a.priority - b.priority : a.tier === 'top' ? -1 : 1));
