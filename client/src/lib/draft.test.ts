import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Comp, Player } from '../api';
import {
  banSuggestions,
  buildBoard,
  champStateFor,
  compViability,
  canBan,
  draftReducer,
  fearlessLocks,
  initialDraftState,
  isAvailable,
  seriesOver,
  lowPoolAlerts,
  SEQUENCE,
  type DraftAction,
  type DraftSetup,
  type GameRecord,
} from './draft';

const player = (id: number, role: Player['role'], top: string[], comp: string[] = []): Player => ({
  id,
  teamId: id < 100 ? 1 : 2,
  name: `P${id}`,
  role,
  aliases: null,
  riotId: null,
  active: true,
  pool: [
    ...top.map((championId, i) => ({ championId, tier: 'top' as const, priority: i + 1 })),
    ...comp.map((championId, i) => ({ championId, tier: 'comp' as const, priority: i + 1 })),
  ],
});

const ban = (championId: string | null): DraftAction => ({ championId, playerId: null });

test('orden competitivo de 20 pasos', () => {
  const s = SEQUENCE.map((x) => `${x.type[0]}${x.side}`).join(' ');
  assert.equal(
    s,
    'bB bR bB bR bB bR pB pR pR pB pB pR bR bB bR bB pR pB pB pR',
  );
});

test('estados de campeón desde la tarjeta de un jugador', () => {
  // azul = nosotros. Paso 0 ban azul Garen, paso 1 ban rojo Zed ... pasos 6+ picks
  const actions: DraftAction[] = [ban('Garen'), ban('Zed'), ban(null), ban(null), ban(null), ban(null),
    { championId: 'Jinx', playerId: 1 }, // pick azul (nuestro jugador 1)
    { championId: 'Ahri', playerId: null }, // pick rojo sin asignar
  ];
  const b = buildBoard(actions);
  assert.equal(champStateFor(b, 'Garen', 'B', 2).kind, 'ban');
  assert.equal(champStateFor(b, 'Zed', 'B', 2).kind, 'ban');
  assert.equal(champStateFor(b, 'Jinx', 'B', 1).kind, 'own');
  assert.deepEqual(champStateFor(b, 'Jinx', 'B', 2), { kind: 'mate', playerId: 1 });
  assert.equal(champStateFor(b, 'Ahri', 'B', 2).kind, 'enemy');
  assert.equal(champStateFor(b, 'Lux', 'B', 2).kind, 'available');
  assert.deepEqual(b.bans.B, ['Garen', null, null]);
});

test('deshacer es pop y asignar modifica el pick rival', () => {
  const setup: DraftSetup = { format: 1, fearless: 'hard', ourSide: 'B', ownLineup: { TOP: 1, JG: 2, MID: 3, ADC: 4, SUPP: 5 }, rivalTeamId: null, rivalLineup: { TOP: null, JG: null, MID: null, ADC: null, SUPP: null } };
  let s = draftReducer(initialDraftState, { type: 'start', setup });
  s = draftReducer(s, { type: 'act', action: ban('Garen') });
  s = draftReducer(s, { type: 'act', action: ban('Zed') });
  s = draftReducer(s, { type: 'undo' });
  assert.deepEqual(s.actions, [ban('Garen')]);
  s = draftReducer(s, { type: 'assign', stepIndex: 0, playerId: 7 });
  assert.equal(s.actions[0].playerId, 7);
  // cambiar de lado reinicia, mantener el lado conserva
  assert.equal(draftReducer(s, { type: 'start', setup }).actions.length, 1);
  assert.equal(draftReducer(s, { type: 'start', setup: { ...setup, ourSide: 'R' } }).actions.length, 0);
});

test('sugerencias de ban y alerta de pool bajo', () => {
  const rival = [player(101, 'MID', ['Ahri', 'Zed', 'Lux']), player(102, 'ADC', ['Jinx'])];
  const b = buildBoard([ban('Ahri')]);
  const sugg = banSuggestions(b, rival).map((x) => x.championId).sort();
  assert.deepEqual(sugg, ['Jinx', 'Lux', 'Zed']);

  const ours = [player(1, 'TOP', ['Garen', 'Darius', 'Sett'])];
  assert.equal(lowPoolAlerts(buildBoard([ban('Garen')]), ours).length, 1);
  assert.equal(lowPoolAlerts(buildBoard([ban(null)]), ours).length, 0);
});

test('viabilidad de comps: viable, con reemplazo, rota', () => {
  const comp: Comp = {
    id: 1, name: 'X', style: 'engage', gamePlan: null, keyPoint: null, active: true,
    slots: [
      { role: 'TOP', playerId: 1, championId: 'Malphite', alternatives: ['Ornn'] },
      { role: 'JG', playerId: 2, championId: 'Amumu', alternatives: [] },
      { role: 'MID', playerId: 3, championId: 'Seraphine', alternatives: [] },
      { role: 'ADC', playerId: 4, championId: 'Jinx', alternatives: [] },
      { role: 'SUPP', playerId: 5, championId: 'Leona', alternatives: [] },
    ],
  };
  const lineup = { TOP: 1, JG: 2, MID: 3, ADC: 4, SUPP: 6 };
  const rivalPool = new Set(['Jinx']);

  const v0 = compViability(comp, buildBoard([]), 'B', lineup, rivalPool);
  assert.equal(v0.status, 'viable');
  assert.equal(v0.ready, 5);
  assert.ok(v0.slots.find((s) => s.role === 'SUPP')!.lineupMismatch);
  assert.ok(v0.slots.find((s) => s.role === 'ADC')!.rivalRisk);

  const v1 = compViability(comp, buildBoard([ban('Malphite')]), 'B', lineup, rivalPool);
  assert.equal(v1.status, 'replaced');
  assert.deepEqual(v1.slots[0].status, { kind: 'alt', championId: 'Ornn', original: 'Malphite', picked: false });

  const v2 = compViability(comp, buildBoard([ban('Malphite'), ban('Amumu')]), 'B', lineup, rivalPool);
  assert.equal(v2.status, 'broken');
  assert.equal(v2.ready, 4);

  // pick propio del jugador indicado cuenta como listo; pickeado por otro compañero no
  const picks: DraftAction[] = [...Array(6)].map(() => ban(null));
  picks.push({ championId: 'Jinx', playerId: 4 });
  const v3 = compViability(comp, buildBoard(picks), 'B', lineup, rivalPool);
  assert.equal(v3.status, 'viable');
  assert.equal(v3.picked, 1);
  picks[6] = { championId: 'Jinx', playerId: 3 };
  assert.equal(compViability(comp, buildBoard(picks), 'B', lineup, rivalPool).status, 'broken');
});

// Partida donde nosotros (azul) pickeamos Jinx y el rival Ahri
const skip6 = [...Array(6)].map(() => ban(null));
const gameBlue: GameRecord = {
  ourSide: 'B',
  ownLineup: { TOP: 1, JG: 2, MID: 3, ADC: 4, SUPP: 5 },
  rivalLineup: { TOP: null, JG: null, MID: null, ADC: null, SUPP: null },
  actions: [...skip6, { championId: 'Jinx', playerId: 4 }, { championId: 'Ahri', playerId: null }],
  winner: 'own',
};

test('fearless completo: lo pickeado por cualquiera se bloquea para ambos, aunque cambie el lado', () => {
  const locks = fearlessLocks([gameBlue], { format: 3, fearless: 'hard', ourSide: 'R' });
  for (const side of ['B', 'R'] as const) {
    assert.equal(locks[side].get('Jinx'), 1);
    assert.equal(locks[side].get('Ahri'), 1);
  }
  const b = buildBoard([], locks);
  assert.equal(isAvailable(b, 'Jinx', 'R'), false);
  assert.deepEqual(champStateFor(b, 'Jinx', 'R', 4), { kind: 'fearless', game: 1 });
  assert.equal(canBan(b, 'Ahri', 'R'), false); // no tiene sentido banear algo bloqueado
  assert.equal(canBan(b, 'Lux', 'R'), true);
  // los bans no se arrastran
  assert.equal(fearlessLocks([{ ...gameBlue, actions: [ban('Zed')] }], { format: 3, fearless: 'hard', ourSide: 'B' }).B.size, 0);
});

test('fearless por equipo: cada uno solo pierde sus propios picks', () => {
  // partida 2: ahora jugamos de rojo
  const locks = fearlessLocks([gameBlue], { format: 3, fearless: 'team', ourSide: 'R' });
  assert.ok(locks.R.has('Jinx') && !locks.R.has('Ahri')); // nosotros
  assert.ok(locks.B.has('Ahri') && !locks.B.has('Jinx')); // rival
  const b = buildBoard([], locks);
  assert.equal(isAvailable(b, 'Ahri', 'R'), true); // podemos tomar Ahri
  assert.equal(canBan(b, 'Jinx', 'R'), true); // el rival todavía puede pickear Jinx: se puede banear
});

test('BO1 no aplica fearless', () => {
  assert.equal(fearlessLocks([gameBlue], { format: 1, fearless: 'hard', ourSide: 'B' }).B.size, 0);
});

test('serie: terminar partidas, fin al llegar a las victorias necesarias', () => {
  assert.equal(seriesOver(3, [gameBlue]), false);
  assert.equal(seriesOver(3, [gameBlue, gameBlue]), true);
  assert.equal(seriesOver(5, [gameBlue, { ...gameBlue, winner: 'rival' }, gameBlue]), false);
  assert.equal(seriesOver(1, [{ ...gameBlue, winner: 'rival' }]), true);

  const setup: DraftSetup = { format: 3, fearless: 'hard', ourSide: 'B', ownLineup: gameBlue.ownLineup, rivalTeamId: 9, rivalLineup: gameBlue.rivalLineup };
  let s = draftReducer(initialDraftState, { type: 'start', setup });
  for (const a of gameBlue.actions) s = draftReducer(s, { type: 'act', action: a });
  s = draftReducer(s, { type: 'finish-game', winner: 'own' });
  assert.equal(s.games.length, 1);
  assert.equal(s.actions.length, 0);
  assert.equal(s.editing, true); // elegir lado para la partida 2
  s = draftReducer(s, { type: 'start', setup: { ...setup, ourSide: 'R' } });
  assert.equal(s.games.length, 1); // misma serie aunque cambie el lado
  assert.equal(s.setup!.ourSide, 'R');
  s = draftReducer(s, { type: 'reopen-last-game' });
  assert.equal(s.games.length, 0);
  assert.equal(s.actions.length, gameBlue.actions.length);
  assert.equal(s.setup!.ourSide, 'B');
  // cambiar de rival arranca serie nueva
  s = draftReducer(s, { type: 'finish-game', winner: 'own' });
  s = draftReducer(s, { type: 'start', setup: { ...setup, rivalTeamId: 10 } });
  assert.equal(s.games.length, 0);
});
