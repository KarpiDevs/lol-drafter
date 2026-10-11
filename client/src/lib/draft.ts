import type { Comp, Player, Role } from '../api';
import { ROLES } from '../api';

export type Side = 'B' | 'R';
export type StepType = 'ban' | 'pick';
export type Step = { type: StepType; side: Side; phase: string; index: number };

const PHASES: [string, StepType, Side[]][] = [
  ['Bans 1', 'ban', ['B', 'R', 'B', 'R', 'B', 'R']],
  ['Picks 1', 'pick', ['B', 'R', 'R', 'B', 'B', 'R']],
  ['Bans 2', 'ban', ['R', 'B', 'R', 'B']],
  ['Picks 2', 'pick', ['R', 'B', 'B', 'R']],
];

export const SEQUENCE: Step[] = PHASES.flatMap(([phase, type, sides]) => sides.map((side) => ({ phase, type, side }))).map(
  (s, index) => ({ ...s, index }),
);

/** Acción de un paso: championId null = ban salteado. playerId = jugador (nuestro o rival) que lo pickea. */
export type DraftAction = { championId: string | null; playerId: number | null };

export type Lineup = Record<Role, number | null>;
export const emptyLineup = (): Lineup => ({ TOP: null, JG: null, MID: null, ADC: null, SUPP: null });

export type SeriesFormat = 1 | 3 | 5;
/** hard = lo pickeado por cualquiera en partidas anteriores queda bloqueado para ambos equipos.
 *  team = cada equipo no puede repetir sus propios picks. */
export type FearlessMode = 'hard' | 'team';

export type DraftSetup = {
  ourSide: Side; // B = azul (primer ban y pick), R = rojo (último pick)
  ownLineup: Lineup;
  rivalTeamId: number | null;
  rivalLineup: Lineup;
  format: SeriesFormat;
  fearless: FearlessMode;
};

/** Partida terminada de la serie. */
export type GameRecord = {
  ourSide: Side;
  ownLineup: Lineup;
  rivalLineup: Lineup;
  actions: DraftAction[];
  winner: 'own' | 'rival';
};

/** editing = está en la pantalla de setup (se conserva la última configuración para precargarla).
 *  games = partidas ya jugadas de la serie actual; actions = draft de la partida en curso. */
export type DraftState = { setup: DraftSetup | null; editing: boolean; actions: DraftAction[]; games: GameRecord[] };

export const initialDraftState: DraftState = { setup: null, editing: true, actions: [], games: [] };

export type DraftEvent =
  | { type: 'start'; setup: DraftSetup }
  | { type: 'edit-setup' }
  | { type: 'act'; action: DraftAction }
  | { type: 'undo' }
  | { type: 'reset' }
  | { type: 'assign'; stepIndex: number; playerId: number | null }
  | { type: 'finish-game'; winner: 'own' | 'rival' }
  | { type: 'reopen-last-game' }
  | { type: 'new-series' }
  | { type: 'load'; state: DraftState };

export function draftReducer(state: DraftState, ev: DraftEvent): DraftState {
  switch (ev.type) {
    case 'start': {
      const prev = state.setup;
      // Cambiar rival o formato arranca una serie nueva
      const sameSeries =
        !!prev &&
        prev.rivalTeamId === ev.setup.rivalTeamId &&
        prev.format === ev.setup.format &&
        prev.fearless === ev.setup.fearless;
      // Si además cambia el lado, la partida en curso se reinicia
      const keepActions = sameSeries && prev!.ourSide === ev.setup.ourSide;
      return {
        setup: ev.setup,
        editing: false,
        actions: keepActions ? state.actions : [],
        games: sameSeries ? state.games : [],
      };
    }
    case 'finish-game': {
      if (!state.setup) return state;
      const game: GameRecord = {
        ourSide: state.setup.ourSide,
        ownLineup: state.setup.ownLineup,
        rivalLineup: state.setup.rivalLineup,
        actions: state.actions,
        winner: ev.winner,
      };
      const games = [...state.games, game];
      // Si la serie sigue, se pasa a elegir lado para la próxima partida
      return { ...state, games, actions: [], editing: !seriesOver(state.setup.format, games) };
    }
    case 'reopen-last-game': {
      const last = state.games[state.games.length - 1];
      if (!last || !state.setup) return state;
      return {
        setup: { ...state.setup, ourSide: last.ourSide, ownLineup: last.ownLineup, rivalLineup: last.rivalLineup },
        editing: false,
        actions: last.actions,
        games: state.games.slice(0, -1),
      };
    }
    case 'new-series':
      return { ...state, editing: true, actions: [], games: [] };
    case 'edit-setup':
      return { ...state, editing: true };
    case 'act':
      if (state.actions.length >= SEQUENCE.length) return state;
      return { ...state, actions: [...state.actions, ev.action] };
    case 'undo':
      return { ...state, actions: state.actions.slice(0, -1) };
    case 'reset':
      return { ...state, actions: [] };
    case 'assign':
      return {
        ...state,
        actions: state.actions.map((a, i) => (i === ev.stepIndex ? { ...a, playerId: ev.playerId } : a)),
      };
    case 'load':
      return ev.state;
  }
}

// ---------- series y fearless ----------

export const winsNeeded = (format: SeriesFormat) => Math.ceil(format / 2);

export function seriesScore(games: GameRecord[]) {
  return {
    own: games.filter((g) => g.winner === 'own').length,
    rival: games.filter((g) => g.winner === 'rival').length,
  };
}

export function seriesOver(format: SeriesFormat, games: GameRecord[]) {
  const { own, rival } = seriesScore(games);
  return own >= winsNeeded(format) || rival >= winsNeeded(format) || games.length >= format;
}

/** Campeón bloqueado por fearless -> número de partida en que se jugó. */
export type FearlessLocks = Record<Side, Map<string, number>>;

export const noLocks = (): FearlessLocks => ({ B: new Map(), R: new Map() });

/** Bloqueos para la partida en curso, según lo pickeado en las partidas anteriores de la serie. */
export function fearlessLocks(games: GameRecord[], setup: Pick<DraftSetup, 'format' | 'fearless' | 'ourSide'>): FearlessLocks {
  const locks = noLocks();
  if (setup.format === 1) return locks;
  const ownPicked = new Map<string, number>();
  const rivalPicked = new Map<string, number>();
  games.forEach((g, gi) => {
    g.actions.forEach((a, i) => {
      const step = SEQUENCE[i];
      if (!step || step.type !== 'pick' || !a.championId) return;
      (step.side === g.ourSide ? ownPicked : rivalPicked).set(a.championId, gi + 1);
    });
  });
  const theirSide = otherSide(setup.ourSide);
  if (setup.fearless === 'hard') {
    const all = new Map([...ownPicked, ...rivalPicked]);
    locks[setup.ourSide] = all;
    locks[theirSide] = new Map(all);
  } else {
    locks[setup.ourSide] = ownPicked;
    locks[theirSide] = rivalPicked;
  }
  return locks;
}

// ---------- estado derivado ----------

export type TakenInfo = { kind: 'ban'; side: Side } | { kind: 'pick'; side: Side; playerId: number | null };

export type Board = {
  taken: Map<string, TakenInfo>;
  bans: Record<Side, (string | null | undefined)[]>; // undefined = slot vacío, null = ban salteado
  picks: Record<Side, { championId: string; playerId: number | null; stepIndex: number }[]>;
  pickedBy: Map<number, string>; // playerId -> championId
  locked: FearlessLocks; // bloqueos fearless de la partida en curso
};

export function buildBoard(actions: DraftAction[], locked: FearlessLocks = noLocks()): Board {
  const taken = new Map<string, TakenInfo>();
  const bans: Board['bans'] = { B: [], R: [] };
  const picks: Board['picks'] = { B: [], R: [] };
  const pickedBy = new Map<number, string>();
  actions.forEach((a, i) => {
    const step = SEQUENCE[i];
    if (step.type === 'ban') {
      bans[step.side].push(a.championId);
      if (a.championId) taken.set(a.championId, { kind: 'ban', side: step.side });
    } else if (a.championId) {
      picks[step.side].push({ championId: a.championId, playerId: a.playerId, stepIndex: i });
      taken.set(a.championId, { kind: 'pick', side: step.side, playerId: a.playerId });
      if (a.playerId != null) pickedBy.set(a.playerId, a.championId);
    }
  });
  return { taken, bans, picks, pickedBy, locked };
}

export const otherSide = (s: Side): Side => (s === 'B' ? 'R' : 'B');

export type ChampState =
  | { kind: 'available' }
  | { kind: 'ban' }
  | { kind: 'fearless'; game: number } // ya jugado en una partida anterior de la serie
  | { kind: 'enemy' } // pickeado por el otro equipo
  | { kind: 'mate'; playerId: number | null } // pickeado por un compañero (o sin asignar)
  | { kind: 'own' }; // pick de este jugador

/** Estado de un campeón visto desde la tarjeta de `playerId`, que juega en `side`. */
export function champStateFor(board: Board, championId: string, side: Side, playerId: number): ChampState {
  const t = board.taken.get(championId);
  if (!t) {
    const game = board.locked[side].get(championId);
    return game ? { kind: 'fearless', game } : { kind: 'available' };
  }
  if (t.kind === 'ban') return { kind: 'ban' };
  if (t.side !== side) return { kind: 'enemy' };
  if (t.playerId === playerId) return { kind: 'own' };
  return { kind: 'mate', playerId: t.playerId };
}

/** Libre en este draft; si se pasa `side`, además no bloqueado por fearless para ese lado. */
export const isAvailable = (board: Board, championId: string, side?: Side) =>
  !board.taken.has(championId) && !(side && board.locked[side].has(championId));

/** Se puede banear si el otro equipo todavía podría pickearlo. */
export const canBan = (board: Board, championId: string, banningSide: Side) =>
  isAvailable(board, championId, otherSide(banningSide));

export function availableCount(board: Board, player: Player, side?: Side) {
  return player.pool.filter((e) => isAvailable(board, e.championId, side)).length;
}

export function lineupPlayers(lineup: Lineup, players: Player[]) {
  return ROLES.map((role) => players.find((p) => p.id === lineup[role])).filter((p): p is Player => !!p);
}

export function poolIds(players: Player[]) {
  const s = new Set<string>();
  for (const p of players) for (const e of p.pool) s.add(e.championId);
  return s;
}

/** Sugerencias de ban: top 1–2 disponibles de cada jugador rival. */
export function banSuggestions(board: Board, rivalPlayers: Player[], rivalSide?: Side, perPlayer = 2) {
  const out: { championId: string; playerId: number; priority: number }[] = [];
  for (const p of rivalPlayers) {
    if (board.pickedBy.has(p.id)) continue; // ya pickeó
    const top = p.pool
      .filter((e) => e.tier === 'top' && isAvailable(board, e.championId, rivalSide))
      .sort((a, b) => a.priority - b.priority)
      .slice(0, perPlayer);
    for (const e of top) out.push({ championId: e.championId, playerId: p.id, priority: e.priority });
  }
  return out.sort((a, b) => a.priority - b.priority);
}

/** Jugadores propios sin pick a los que les quedan ≤ threshold campeones. */
export function lowPoolAlerts(board: Board, ownPlayers: Player[], ownSide?: Side, threshold = 2) {
  return ownPlayers
    .filter((p) => !board.pickedBy.has(p.id) && p.pool.length > 0)
    .map((p) => ({ player: p, left: availableCount(board, p, ownSide) }))
    .filter((x) => x.left <= threshold);
}

// ---------- viabilidad de comps ----------

export type SlotStatus =
  | { kind: 'ok'; championId: string; picked: boolean }
  | { kind: 'alt'; championId: string; original: string; picked: boolean }
  | { kind: 'down'; championId: string | null };

export type CompViability = {
  comp: Comp;
  status: 'viable' | 'replaced' | 'broken';
  slots: { role: Role; playerId: number | null; status: SlotStatus; lineupMismatch: boolean; rivalRisk: boolean }[];
  ready: number;
  picked: number;
};

export function compViability(
  comp: Comp,
  board: Board,
  ourSide: Side,
  ownLineup: Lineup,
  rivalPool: Set<string>,
): CompViability {
  const usable = (championId: string, playerId: number | null) => {
    const t = board.taken.get(championId);
    if (!t) return { ok: !board.locked[ourSide].has(championId), picked: false };
    if (t.kind === 'pick' && t.side === ourSide && t.playerId != null && t.playerId === playerId)
      return { ok: true, picked: true };
    return { ok: false, picked: false };
  };

  const slots = comp.slots.map((s) => {
    let status: SlotStatus;
    if (!s.championId) status = { kind: 'down', championId: null };
    else {
      const main = usable(s.championId, s.playerId);
      if (main.ok) status = { kind: 'ok', championId: s.championId, picked: main.picked };
      else {
        const alt = s.alternatives.map((a) => ({ id: a, u: usable(a, s.playerId) })).find((x) => x.u.ok);
        status = alt
          ? { kind: 'alt', championId: alt.id, original: s.championId, picked: alt.u.picked }
          : { kind: 'down', championId: s.championId };
      }
    }
    const shown = status.championId;
    return {
      role: s.role,
      playerId: s.playerId,
      status,
      lineupMismatch: s.playerId != null && ownLineup[s.role] !== s.playerId,
      rivalRisk: !!shown && status.kind !== 'down' && !('picked' in status && status.picked) && rivalPool.has(shown),
    };
  });

  const down = slots.some((s) => s.status.kind === 'down');
  const alt = slots.some((s) => s.status.kind === 'alt');
  return {
    comp,
    status: down ? 'broken' : alt ? 'replaced' : 'viable',
    slots,
    ready: slots.filter((s) => s.status.kind !== 'down').length,
    picked: slots.filter((s) => s.status.kind !== 'down' && s.status.picked).length,
  };
}

const STATUS_ORDER = { viable: 0, replaced: 1, broken: 2 } as const;
export const sortViabilities = (list: CompViability[]) =>
  [...list].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.ready - a.ready || b.picked - a.picked);
