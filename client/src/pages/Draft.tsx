import { useEffect, useMemo, useReducer, useState } from 'react';
import {
  api,
  matchesSearch,
  ROLE_LABEL,
  ROLES,
  sortPool,
  useApiMutation,
  useChampionMap,
  useChampions,
  useComps,
  useOwnTeam,
  useTeam,
  useTeams,
  type Champion,
  type Player,
  type Role,
  type Team,
} from '../api';
import { ChampIcon } from '../components/ChampIcon';
import { CompsPanel } from '../components/CompsPanel';
import { Modal } from '../components/Modal';
import {
  availableCount,
  banSuggestions,
  buildBoard,
  champStateFor,
  compViability,
  canBan,
  draftReducer,
  emptyLineup,
  fearlessLocks,
  isAvailable,
  seriesOver,
  seriesScore,
  winsNeeded,
  initialDraftState,
  lineupPlayers,
  lowPoolAlerts,
  otherSide,
  poolIds,
  SEQUENCE,
  sortViabilities,
  type Board,
  type DraftSetup,
  type DraftState,
  type FearlessMode,
  type GameRecord,
  type Lineup,
  type SeriesFormat,
  type Side,
} from '../lib/draft';

const STORAGE_KEY = 'draft-politecnica:state:v1';

function loadState(): DraftState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = { ...initialDraftState, ...JSON.parse(raw) } as DraftState;
      // Estados guardados antes de que existieran las series
      if (saved.setup)
        saved.setup = { ...saved.setup, format: saved.setup.format ?? 1, fearless: saved.setup.fearless ?? 'hard' };
      return saved;
    }
  } catch {
    // sin storage: arrancar de cero
  }
  return initialDraftState;
}

/** Usado desde Historial para abrir un draft guardado en el simulador. */
export function storeDraftState(state: DraftState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignorar
  }
}

const defaultLineup = (players: Player[]): Lineup => {
  const l = emptyLineup();
  for (const role of ROLES) {
    const ofRole = players.filter((p) => p.role === role);
    l[role] = (ofRole.find((p) => p.active) ?? ofRole[0])?.id ?? null;
  }
  return l;
};

export function DraftPage() {
  const [state, dispatch] = useReducer(draftReducer, undefined, loadState);
  useEffect(() => storeDraftState(state), [state]);

  const own = useOwnTeam();
  const rival = useTeam(state.setup?.rivalTeamId ?? null);
  const champions = useChampions();

  if (own.isLoading || champions.isLoading) return <p className="muted">Cargando…</p>;
  if (!own.data) return <p className="error">No hay equipo propio cargado. Corré <code>npm run db:seed</code>.</p>;

  if (state.editing || !state.setup) {
    return (
      <Setup
        ownTeam={own.data}
        initial={state.setup}
        hasActions={state.actions.length > 0}
        games={state.games}
        onStart={(setup) => dispatch({ type: 'start', setup })}
        onCancel={state.setup && state.actions.length > 0 ? () => dispatch({ type: 'start', setup: state.setup! }) : undefined}
        onNewSeries={() => dispatch({ type: 'new-series' })}
        onReopenLast={() => dispatch({ type: 'reopen-last-game' })}
      />
    );
  }
  return (
    <DraftBoard
      state={state as DraftState & { setup: DraftSetup }}
      dispatch={dispatch}
      ownTeam={own.data}
      rivalTeam={state.setup.rivalTeamId ? rival.data : undefined}
    />
  );
}

// ======================================================================
// Setup
// ======================================================================

function Setup({
  ownTeam,
  initial,
  hasActions,
  games,
  onStart,
  onCancel,
  onNewSeries,
  onReopenLast,
}: {
  ownTeam: Team;
  initial: DraftSetup | null;
  hasActions: boolean;
  games: GameRecord[];
  onStart: (s: DraftSetup) => void;
  onCancel?: () => void;
  onNewSeries: () => void;
  onReopenLast: () => void;
}) {
  const { data: teams = [] } = useTeams();
  const rivals = teams.filter((t) => !t.isOwn);
  const [side, setSide] = useState<Side>(initial?.ourSide ?? 'B');
  const [ownLineup, setOwnLineup] = useState<Lineup>(() => initial?.ownLineup ?? defaultLineup(ownTeam.players));
  const [rivalId, setRivalId] = useState<number | null>(initial?.rivalTeamId ?? null);
  const [rivalLineup, setRivalLineup] = useState<Lineup>(initial?.rivalLineup ?? emptyLineup());
  const [format, setFormat] = useState<SeriesFormat>(initial?.format ?? 1);
  const [fearless, setFearless] = useState<FearlessMode>(initial?.fearless ?? 'hard');
  const rivalTeam = useTeam(rivalId);
  // Con una serie en curso, rival y formato quedan fijos: solo se elige lado y alineación
  const inSeries = games.length > 0 && !!initial;
  const score = seriesScore(games);
  const locks = initial ? fearlessLocks(games, { ...initial, ourSide: side }) : null;
  const lockedCount = locks ? new Set([...locks.B.keys(), ...locks.R.keys()]).size : 0;

  // Al cambiar de rival, precargar su alineación por defecto
  const [loadedRival, setLoadedRival] = useState<number | null>(initial?.rivalTeamId ?? null);
  useEffect(() => {
    if (rivalTeam.data && rivalTeam.data.id !== loadedRival) {
      setRivalLineup(defaultLineup(rivalTeam.data.players));
      setLoadedRival(rivalTeam.data.id);
    }
  }, [rivalTeam.data, loadedRival]);

  const complete = ROLES.every((r) => ownLineup[r] != null);
  const willReset =
    hasActions &&
    initial &&
    (initial.ourSide !== side || initial.rivalTeamId !== rivalId || initial.format !== format || initial.fearless !== fearless);
  const rivalLabel = rivals.find((t) => t.id === rivalId)?.name ?? 'Rival';

  return (
    <>
      <div className="page-head">
        <h1>{inSeries ? `Partida ${games.length + 1} · elegí lado` : 'Nuevo draft'}</h1>
        {inSeries && (
          <>
            <span className="chip gold">BO{initial!.format}</span>
            <span className="chip">
              {ownTeam.shortName ?? ownTeam.name} {score.own} – {score.rival} {rivalLabel}
            </span>
            <div className="spacer" />
            <button className="ghost" onClick={onReopenLast}>Volver a la partida {games.length}</button>
            <button className="danger" onClick={() => confirm('¿Descartar la serie actual y empezar una nueva?') && onNewSeries()}>
              Nueva serie
            </button>
          </>
        )}
      </div>
      {inSeries && lockedCount > 0 && (
        <p className="muted small" style={{ marginTop: -8 }}>
          Fearless {initial!.fearless === 'hard' ? 'completo' : 'por equipo'}: {lockedCount} campeones bloqueados de partidas anteriores.
        </p>
      )}
      <div className="setup">
        <div className="col" style={{ gap: 16 }}>
          <div className="panel">
            <h3 style={{ marginBottom: 10 }}>Lado</h3>
            <div className="side-pick">
              <button className={`side-btn blue${side === 'B' ? ' active' : ''}`} onClick={() => setSide('B')}>
                <b style={{ color: '#8cc0ff' }}>Lado azul</b>
                <span className="small muted">Primer ban y primer pick</span>
              </button>
              <button className={`side-btn red${side === 'R' ? ' active' : ''}`} onClick={() => setSide('R')}>
                <b style={{ color: '#ff9a9d' }}>Lado rojo</b>
                <span className="small muted">Último pick (counter)</span>
              </button>
            </div>
          </div>
          <div className="panel">
            <h3 style={{ marginBottom: 10 }}>Formato</h3>
            <div className="seg">
              {([1, 3, 5] as SeriesFormat[]).map((f) => (
                <button key={f} className={format === f ? 'active' : ''} disabled={inSeries} onClick={() => setFormat(f)}>
                  BO{f}
                </button>
              ))}
            </div>
            {format > 1 && (
              <label style={{ marginTop: 10 }}>
                <span>Fearless</span>
                <select value={fearless} disabled={inSeries} onChange={(e) => setFearless(e.target.value as FearlessMode)}>
                  <option value="hard">Completo: lo que pickeó cualquiera queda bloqueado para ambos</option>
                  <option value="team">Por equipo: cada equipo no puede repetir sus propios picks</option>
                </select>
              </label>
            )}
            {inSeries && <p className="small dim" style={{ margin: '8px 0 0' }}>Para cambiar formato o rival, empezá una nueva serie.</p>}
          </div>
          <div className="panel">
            <h3 style={{ marginBottom: 10 }}>{ownTeam.name}: alineación</h3>
            {ROLES.map((role) => {
              const opts = ownTeam.players.filter((p) => p.role === role);
              return (
                <div key={role} className="lineup-row">
                  <span className="label">{ROLE_LABEL[role]}</span>
                  <div className="seg">
                    {opts.length === 0 && <span className="small error">Sin jugadores de este rol</span>}
                    {opts.map((p) => (
                      <button
                        key={p.id}
                        className={ownLineup[role] === p.id ? 'active' : ''}
                        onClick={() => setOwnLineup({ ...ownLineup, [role]: p.id })}
                      >
                        {p.name}
                        {!p.active && <span className="dim small"> (inactivo)</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel">
          <h3 style={{ marginBottom: 10 }}>Rival</h3>
          <label>
            <span>Equipo rival</span>
            <select value={rivalId ?? ''} disabled={inSeries} onChange={(e) => setRivalId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Rival genérico (sin pools)</option>
              {rivals.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.shortName ? ` (${t.shortName})` : ''}
                </option>
              ))}
            </select>
          </label>
          {rivals.length === 0 && (
            <p className="small muted">Todavía no hay rivales cargados. Podés darlos de alta en Equipos.</p>
          )}
          {rivalId && rivalTeam.data && (
            <div style={{ marginTop: 12 }}>
              {rivalTeam.data.notes && <p className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{rivalTeam.data.notes}</p>}
              {ROLES.map((role) => {
                const opts = rivalTeam.data!.players.filter((p) => p.role === role);
                return (
                  <div key={role} className="lineup-row">
                    <span className="label">{ROLE_LABEL[role]}</span>
                    <select
                      value={rivalLineup[role] ?? ''}
                      onChange={(e) => setRivalLineup({ ...rivalLineup, [role]: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">— Desconocido —</option>
                      {opts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.pool.length} campeones{p.active ? '' : ' (suplente)'}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button
          className="primary"
          disabled={!complete}
          onClick={() =>
            onStart({
              ourSide: side,
              ownLineup,
              rivalTeamId: rivalId,
              rivalLineup: rivalId ? rivalLineup : emptyLineup(),
              format,
              fearless,
            })
          }
        >
          {hasActions && !willReset ? 'Volver al draft' : inSeries ? `Empezar partida ${games.length + 1}` : 'Empezar draft'}
        </button>
        {onCancel && <button className="ghost" onClick={onCancel}>Cancelar</button>}
        {willReset && <span className="small warn">Hubo cambios de lado, rival o formato: la partida en curso se reinicia.</span>}
      </div>
    </>
  );
}

// ======================================================================
// Tablero
// ======================================================================

type MobileTab = 'own' | 'rival' | 'grid' | 'comps';

function DraftBoard({
  state,
  dispatch,
  ownTeam,
  rivalTeam,
}: {
  state: DraftState & { setup: DraftSetup };
  dispatch: React.Dispatch<Parameters<typeof draftReducer>[1]>;
  ownTeam: Team;
  rivalTeam?: Team;
}) {
  const { setup, actions } = state;
  const ourSide = setup.ourSide;
  const theirSide = otherSide(ourSide);
  const champMap = useChampionMap();
  const { data: champions = [] } = useChampions();
  const { data: comps = [] } = useComps();

  const { games } = state;
  const locks = useMemo(() => fearlessLocks(games, setup), [games, setup]);
  const board = useMemo(() => buildBoard(actions, locks), [actions, locks]);
  const step = SEQUENCE[actions.length];
  const done = !step;
  const isSeries = setup.format > 1;
  const gameNumber = games.length + 1;
  const score = seriesScore(games);

  const ownPlayers = lineupPlayers(setup.ownLineup, ownTeam.players);
  const rivalPlayers = rivalTeam ? lineupPlayers(setup.rivalLineup, rivalTeam.players) : [];
  const ownPool = useMemo(() => poolIds(ownPlayers), [ownPlayers]);
  const rivalPool = useMemo(() => poolIds(rivalPlayers), [rivalPlayers]);
  const common = useMemo(() => new Set([...ownPool].filter((id) => rivalPool.has(id))), [ownPool, rivalPool]);

  const ownName = ownTeam.shortName ?? ownTeam.name;
  const rivalName = rivalTeam ? rivalTeam.shortName ?? rivalTeam.name : 'Rival';
  const sideName = (s: Side) => (s === ourSide ? ownName : rivalName);

  // ----- a quién se le asigna el próximo pick -----
  const [ourPickFor, setOurPickFor] = useState<number | null>(null);
  const [rivalPickFor, setRivalPickFor] = useState<number | null>(null);
  const ownWithoutPick = ownPlayers.filter((p) => !board.pickedBy.has(p.id));
  const effectiveOurPickFor =
    ourPickFor != null && ownWithoutPick.some((p) => p.id === ourPickFor) ? ourPickFor : ownWithoutPick[0]?.id ?? null;
  const rivalWithoutPick = rivalPlayers.filter((p) => !board.pickedBy.has(p.id));
  const effectiveRivalPickFor = rivalWithoutPick.some((p) => p.id === rivalPickFor) ? rivalPickFor : null;

  // ----- comps -----
  const [followingId, setFollowingId] = useState<number | null>(null);
  const viabilities = useMemo(
    () =>
      sortViabilities(
        comps.filter((c) => c.active).map((c) => compViability(c, board, ourSide, setup.ownLineup, rivalPool)),
      ),
    [comps, board, ourSide, setup.ownLineup, rivalPool],
  );
  const followed = viabilities.find((v) => v.comp.id === followingId && v.status !== 'broken');
  /** role -> campeón a destacar de la comp seguida (todavía no pickeado) */
  const followByRole = new Map<Role, string>();
  for (const s of followed?.slots ?? []) {
    if (s.status.kind !== 'down' && !s.status.picked) followByRole.set(s.role, s.status.championId);
  }
  const followIds = new Set(followByRole.values());
  const followMismatch = followed?.slots.filter((s) => s.lineupMismatch && s.status.kind !== 'down') ?? [];

  // ----- sugerencias y alertas -----
  const ourBanTurn = step?.type === 'ban' && step.side === ourSide;
  const suggestions = ourBanTurn ? banSuggestions(board, rivalPlayers, theirSide) : [];
  const suggestIds = new Set(suggestions.map((s) => s.championId));
  const alerts = lowPoolAlerts(board, ownPlayers, ourSide);
  const lastIndex = actions.length - 1;
  const last = actions[lastIndex];
  const lastStep = SEQUENCE[lastIndex];
  const freshAlerts =
    last && lastStep.type === 'ban' && lastStep.side === theirSide && last.championId
      ? alerts.filter((a) => a.player.pool.some((e) => e.championId === last.championId))
      : [];

  // ----- acciones -----
  /** Se puede usar en el paso actual: libre y no bloqueado por fearless para quien lo pickearía. */
  const allowed = (championId: string) =>
    !!step && (step.type === 'ban' ? canBan(board, championId, step.side) : isAvailable(board, championId, step.side));

  const act = (championId: string | null, forPlayer?: number | null) => {
    if (!step) return;
    if (championId && !allowed(championId)) return;
    if (step.type === 'ban') return dispatch({ type: 'act', action: { championId, playerId: null } });
    if (!championId) return;
    const playerId =
      forPlayer !== undefined ? forPlayer : step.side === ourSide ? effectiveOurPickFor : effectiveRivalPickFor;
    if (step.side === ourSide && playerId == null) return;
    dispatch({ type: 'act', action: { championId, playerId } });
  };

  const onCardChampion = (cardSide: Side, player: Player, championId: string) => {
    if (!step || !allowed(championId)) return;
    if (step.type === 'ban') return act(championId);
    if (step.side === cardSide && !board.pickedBy.has(player.id)) act(championId, player.id);
  };

  const cardClickable = (cardSide: Side, player: Player) =>
    !!step && (step.type === 'ban' || (step.side === cardSide && !board.pickedBy.has(player.id)));

  // ----- grilla -----
  const [search, setSearch] = useState('');
  const [onlyOurPool, setOnlyOurPool] = useState(false);
  const gridChamps = champions.filter((c) => matchesSearch(c, search) && (!onlyOurPool || ownPool.has(c.id)));

  // Lado desde el que se muestra el bloqueo fearless en la grilla: quien pickearía con este paso
  const gridSide: Side = step ? (step.type === 'pick' ? step.side : otherSide(step.side)) : ourSide;

  const [tab, setTab] = useState<MobileTab>('own');
  const [saving, setSaving] = useState(false);

  // ----- cierre de partida -----
  const saveGame = useApiMutation(
    (winner: 'own' | 'rival') =>
      api.post('/drafts', {
        side: ourSide === 'B' ? 'blue' : 'red',
        rivalTeamId: setup.rivalTeamId,
        ownLineup: setup.ownLineup,
        rivalLineup: setup.rivalTeamId ? setup.rivalLineup : null,
        actions,
        result: winner === 'own' ? 'win' : 'loss',
        notes: isSeries ? `BO${setup.format} · Partida ${gameNumber}` : null,
      }),
    [['drafts']],
  );
  const finishGame = (winner: 'own' | 'rival') => {
    saveGame.mutate(winner); // queda en Historial; si falla, la serie sigue igual
    dispatch({ type: 'finish-game', winner });
  };

  if (seriesOver(setup.format, games) && actions.length === 0) {
    return (
      <SeriesSummary
        state={state}
        ownName={ownName}
        rivalName={rivalName}
        onNew={() => dispatch({ type: 'new-series' })}
        onReopen={() => dispatch({ type: 'reopen-last-game' })}
      />
    );
  }

  const turnText = done
    ? 'Draft terminado'
    : `${step.phase} · ${step.type === 'ban' ? 'Banea' : 'Pickea'} ${sideName(step.side)}`;

  const lockedList = [...new Map([...board.locked[ourSide], ...board.locked[theirSide]])].sort((a, b) => a[1] - b[1]);

  return (
    <>
      {isSeries && (
        <div className="series-bar">
          <span className="chip gold">BO{setup.format}</span>
          <b>Partida {gameNumber}</b>
          <span className="series-score">
            {ownName} <b>{score.own}</b> – <b>{score.rival}</b> {rivalName}
          </span>
          <span className="small muted">
            gana con {winsNeeded(setup.format)} · fearless {setup.fearless === 'hard' ? 'completo' : 'por equipo'}
          </span>
          {lockedList.length > 0 && (
            <div className="locked-list">
              {lockedList.map(([id, g]) => {
                const forUs = board.locked[ourSide].has(id);
                const forThem = board.locked[theirSide].has(id);
                const who = forUs && forThem ? 'ambos' : forUs ? ownName : rivalName;
                return (
                  <span key={id} className="locked" title={`${champMap.get(id)?.name} · partida ${g} · bloqueado para ${who}`}>
                    <ChampIcon champion={champMap.get(id)} size={26} gray />
                    <span className={`g${!forUs ? ' rival' : ''}`}>G{g}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
      <div className="draft-status">
        <div className={`turn ${step?.side ?? ''}`}>
          {turnText}
          {step && step.side === ourSide && <span className="ours"> (nosotros)</span>}
        </div>
        <span className="small muted">Paso {Math.min(actions.length + 1, 20)} de 20</span>
        <div className="spacer grow" />
        <div className="row">
          {step?.type === 'ban' && <button onClick={() => act(null)}>Saltar ban</button>}
          <button onClick={() => dispatch({ type: 'undo' })} disabled={!actions.length}>Deshacer</button>
          <button onClick={() => confirm('¿Reiniciar el draft?') && dispatch({ type: 'reset' })} disabled={!actions.length}>
            Reiniciar draft
          </button>
          <button onClick={() => dispatch({ type: 'edit-setup' })}>Cambiar jugadores</button>
          {done ? (
            <>
              <span className="label">{isSeries ? `Resultado partida ${gameNumber}:` : 'Resultado:'}</span>
              <button className="primary" onClick={() => finishGame('own')}>Ganamos</button>
              <button className="danger" onClick={() => finishGame('rival')}>Perdimos</button>
            </>
          ) : (
            <button onClick={() => setSaving(true)} disabled={!actions.length}>Guardar draft</button>
          )}
        </div>
      </div>

      <div className="progress">
        {SEQUENCE.map((s, i) => (
          <div
            key={i}
            className={`${s.side} ${s.type}${i < actions.length ? ' done' : ''}${i === actions.length ? ' current' : ''}`}
            title={`${i + 1}. ${s.phase} · ${s.type === 'ban' ? 'ban' : 'pick'} ${sideName(s.side)}`}
          />
        ))}
      </div>

      <div className="board">
        {(['B', 'R'] as Side[]).map((side) => (
          <TeamBoard
            key={side}
            side={side}
            name={side === ourSide ? ownTeam.name : rivalTeam?.name ?? 'Rival'}
            isOurs={side === ourSide}
            board={board}
            step={step}
            champMap={champMap}
            lineup={side === ourSide ? setup.ownLineup : setup.rivalLineup}
            players={side === ourSide ? ownTeam.players : rivalTeam?.players ?? []}
            hasLineup={side === ourSide || !!rivalTeam}
            activePlayerId={side === ourSide ? effectiveOurPickFor : effectiveRivalPickFor}
            rivalPlayers={side === ourSide ? [] : rivalPlayers}
            onAssign={(stepIndex, playerId) => dispatch({ type: 'assign', stepIndex, playerId })}
          />
        ))}
      </div>

      {(freshAlerts.length > 0 || suggestions.length > 0 || followMismatch.length > 0) && (
        <div className="alerts">
          {freshAlerts.map((a) => (
            <div key={a.player.id} className="alert warn">
              ⚠️ El ban de {rivalName} a <b>{champMap.get(last!.championId!)?.name}</b> deja a <b>{a.player.name}</b> con{' '}
              {a.left === 0 ? 'ningún campeón' : `${a.left} campeón${a.left === 1 ? '' : 'es'}`} disponible
              {a.left === 1 ? '' : 's'}.
            </div>
          ))}
          {suggestions.length > 0 && (
            <div className="alert info">
              <b>Sugerencias de ban</b> <span className="small muted">— lo mejor que le queda a cada jugador rival</span>
              <div className="sugg-list">
                {suggestions.map((s) => (
                  <button key={s.championId} className="sugg" onClick={() => act(s.championId)}>
                    <ChampIcon champion={champMap.get(s.championId)} size={26} />
                    {champMap.get(s.championId)?.name}
                    <span className="dim small">
                      {rivalPlayers.find((p) => p.id === s.playerId)?.name} #{s.priority}
                    </span>
                    {common.has(s.championId) && <span title="También en nuestro pool">⚔️</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          {followMismatch.length > 0 && (
            <div className="alert warn">
              La comp <b>{followed!.comp.name}</b> usa a{' '}
              {followMismatch.map((s) => ownTeam.players.find((p) => p.id === s.playerId)?.name).join(', ')}, que no está
              en la alineación.
            </div>
          )}
        </div>
      )}
      {alerts.length > 0 && freshAlerts.length === 0 && (
        <p className="small warn" style={{ marginTop: -4 }}>
          Pocas opciones: {alerts.map((a) => `${a.player.name} (${a.left})`).join(', ')}
        </p>
      )}

      <div className="tabs mobile-tabs">
        <button className={tab === 'own' ? 'active' : ''} onClick={() => setTab('own')}>Nosotros</button>
        {rivalTeam && <button className={tab === 'rival' ? 'active' : ''} onClick={() => setTab('rival')}>Rival</button>}
        <button className={tab === 'grid' ? 'active' : ''} onClick={() => setTab('grid')}>Campeones</button>
        <button className={tab === 'comps' ? 'active' : ''} onClick={() => setTab('comps')}>Comps</button>
      </div>

      <div className={`draft-main${rivalTeam ? '' : ' no-rival'}`}>
        <div data-tab="own" className={`pool-cards${tab === 'own' ? ' tab-visible' : ''}`}>
          {ownPlayers.map((p) => (
            <PlayerCard
              key={p.id}
              player={p}
              side={ourSide}
              board={board}
              champMap={champMap}
              teamPlayers={ownTeam.players}
              enemyLabel={rivalName}
              selected={step?.type === 'pick' && step.side === ourSide && effectiveOurPickFor === p.id}
              onSelect={() => !board.pickedBy.has(p.id) && setOurPickFor(p.id)}
              clickable={cardClickable(ourSide, p)}
              onChampion={(id) => onCardChampion(ourSide, p, id)}
              common={common}
              highlight={followByRole.get(p.role)}
              suggest={new Set()}
            />
          ))}
        </div>

        <div data-tab="grid" className={`grid-cell${tab === 'grid' ? ' tab-visible' : ''}`}>
        <div className="panel grid-panel">
          <div className="grid-tools">
            <input
              type="search"
              placeholder="Buscar campeón (Enter elige si hay uno solo)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                const avail = gridChamps.filter((c) => allowed(c.id));
                if (avail.length === 1) {
                  act(avail[0].id);
                  setSearch('');
                }
              }}
            />
            <label className="inline small">
              <input type="checkbox" checked={onlyOurPool} onChange={(e) => setOnlyOurPool(e.target.checked)} />
              Solo nuestro pool
            </label>
          </div>
          {step?.type === 'pick' && (
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="label">Pick para:</span>
              {step.side === ourSide ? (
                <select value={effectiveOurPickFor ?? ''} onChange={(e) => setOurPickFor(Number(e.target.value))}>
                  {ownWithoutPick.map((p) => (
                    <option key={p.id} value={p.id}>{p.role} · {p.name}</option>
                  ))}
                </select>
              ) : (
                <select
                  value={effectiveRivalPickFor ?? ''}
                  onChange={(e) => setRivalPickFor(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">{rivalName} · sin asignar</option>
                  {rivalWithoutPick.map((p) => (
                    <option key={p.id} value={p.id}>{p.role} · {p.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}
          <div className="champ-grid">
            {gridChamps.map((c) => (
              <GridChamp
                key={c.id}
                champion={c}
                board={board}
                disabled={!allowed(c.id)}
                lockedGame={board.locked[gridSide].get(c.id)}
                inPool={ownPool.has(c.id)}
                common={common.has(c.id)}
                suggest={suggestIds.has(c.id)}
                follow={followIds.has(c.id)}
                onClick={() => act(c.id)}
              />
            ))}
          </div>
          <p className="small dim" style={{ margin: '8px 0 0' }}>
            <span style={{ color: 'var(--gold)' }}>●</span> nuestro pool
            {rivalTeam && <> · ⚔️ también en el pool rival</>}
          </p>
        </div>
        </div>

        {rivalTeam && (
          <div data-tab="rival" className={`pool-cards rival-col${tab === 'rival' ? ' tab-visible' : ''}`}>
            {rivalPlayers.length === 0 && <p className="muted small">No elegiste jugadores rivales en el setup.</p>}
            {rivalPlayers.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                side={theirSide}
                board={board}
                champMap={champMap}
                teamPlayers={rivalTeam.players}
                enemyLabel={ownName}
                rival
                selected={step?.type === 'pick' && step.side === theirSide && effectiveRivalPickFor === p.id}
                onSelect={() => !board.pickedBy.has(p.id) && setRivalPickFor(p.id)}
                clickable={cardClickable(theirSide, p)}
                onChampion={(id) => onCardChampion(theirSide, p, id)}
                common={common}
                suggest={suggestIds}
              />
            ))}
          </div>
        )}

        <div data-tab="comps" className={tab === 'comps' ? 'tab-visible' : ''} style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ margin: '8px 0 10px' }}>Comps</h2>
          <CompsPanel
            viabilities={viabilities}
            players={ownTeam.players}
            followingId={followed ? followingId : null}
            onFollow={setFollowingId}
            hasRival={!!rivalTeam}
          />
        </div>
      </div>

      {saving && <SaveDraftModal state={state} onClose={() => setSaving(false)} />}
    </>
  );
}

// ----------------------------------------------------------------------

function TeamBoard({
  side,
  name,
  isOurs,
  board,
  step,
  champMap,
  lineup,
  players,
  hasLineup,
  activePlayerId,
  rivalPlayers,
  onAssign,
}: {
  side: Side;
  name: string;
  isOurs: boolean;
  board: Board;
  step: (typeof SEQUENCE)[number] | undefined;
  champMap: Map<string, Champion>;
  lineup: Lineup;
  players: Player[];
  hasLineup: boolean;
  activePlayerId: number | null;
  rivalPlayers: Player[];
  onAssign: (stepIndex: number, playerId: number | null) => void;
}) {
  const bans = board.bans[side];
  const nextBan = step?.type === 'ban' && step.side === side ? bans.length : -1;
  const picks = board.picks[side];

  // Slots por rol: picks asignados en su rol, los sin asignar llenan los huecos en orden
  type Slot = { role?: Role; player?: Player; pick?: (typeof picks)[number] };
  const slots: Slot[] = ROLES.map((role) => {
    const player = hasLineup ? players.find((p) => p.id === lineup[role]) : undefined;
    return { role: hasLineup ? role : undefined, player, pick: player ? picks.find((p) => p.playerId === player.id) : undefined };
  });
  const placed = new Set(slots.map((s) => s.pick?.stepIndex));
  for (const pick of picks.filter((p) => !placed.has(p.stepIndex))) {
    const free = slots.find((s) => !s.pick && !s.player) ?? slots.find((s) => !s.pick);
    if (free) free.pick = pick;
  }
  const isPickTurn = step?.type === 'pick' && step.side === side;

  return (
    <div className={`team-board ${side}`}>
      <h3>
        <span className={`chip ${side === 'B' ? 'blue' : 'red'}`}>{side === 'B' ? 'Azul' : 'Rojo'}</span>
        <span style={isOurs ? { color: 'var(--gold)' } : undefined}>{name}</span>
      </h3>
      <div className="ban-row">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = bans[i];
          const c = v ? champMap.get(v) : undefined;
          return (
            <span key={i} style={{ display: 'contents' }}>
              {i === 3 && <span className="sep" />}
              <span className={`ban-slot${i === nextBan ? ' active' : ''}`} title={c?.name ?? (v === null ? 'Ban salteado' : '')}>
                {c ? (
                  <>
                    <ChampIcon champion={c} size={38} gray />
                    <span className="x" />
                  </>
                ) : v === null ? (
                  '—'
                ) : (
                  'BAN'
                )}
              </span>
            </span>
          );
        })}
      </div>
      <div className="pick-slots">
        {slots.map((s, i) => {
          const c = s.pick ? champMap.get(s.pick.championId) : undefined;
          const active = isPickTurn && !s.pick && (s.player ? s.player.id === activePlayerId : i === slots.findIndex((x) => !x.pick));
          const pickPlayer = s.pick?.playerId != null ? players.find((p) => p.id === s.pick!.playerId) : undefined;
          return (
            <div key={i} className={`pick-slot${active ? ' active' : ''}${isOurs ? ' own' : ''}`}>
              {c ? <ChampIcon champion={c} size={42} /> : <span className="empty" />}
              <div className="info">
                <span className="cname">{c?.name ?? (s.role ? ROLE_LABEL[s.role] : '—')}</span>
                <span className="pname">
                  {s.pick && !pickPlayer ? (
                    'Sin asignar'
                  ) : (
                    <>
                      {s.role && <b>{s.role} </b>}
                      {(pickPlayer ?? s.player)?.name}
                    </>
                  )}
                </span>
              </div>
              {!isOurs && s.pick && rivalPlayers.length > 0 && (
                <select
                  value={s.pick.playerId ?? ''}
                  onChange={(e) => onAssign(s.pick!.stepIndex, e.target.value ? Number(e.target.value) : null)}
                  title="¿Quién lo juega?"
                >
                  <option value="">Sin asignar</option>
                  {rivalPlayers
                    .filter((p) => p.id === s.pick!.playerId || !board.pickedBy.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.role} · {p.name}</option>
                    ))}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerCard({
  player,
  side,
  board,
  champMap,
  teamPlayers,
  enemyLabel,
  rival,
  selected,
  onSelect,
  clickable,
  onChampion,
  common,
  highlight,
  suggest,
}: {
  player: Player;
  side: Side;
  board: Board;
  champMap: Map<string, Champion>;
  teamPlayers: Player[];
  enemyLabel: string;
  rival?: boolean;
  selected: boolean;
  onSelect: () => void;
  clickable: boolean;
  onChampion: (id: string) => void;
  common: Set<string>;
  highlight?: string;
  suggest: Set<string>;
}) {
  const pool = sortPool(player.pool);
  const avail = availableCount(board, player, side);
  const hasPick = board.pickedBy.has(player.id);
  return (
    <div className={`dcard${selected ? ' selected' : ''}${hasPick ? ' done' : ''}`}>
      <div className="dcard-head" onClick={onSelect}>
        <span className="role">{player.role}</span>
        <span className="pn" style={rival ? undefined : { color: selected ? 'var(--gold)' : undefined }}>{player.name}</span>
        <span className={`count${!hasPick && avail <= 2 && pool.length ? ' low' : ''}`}>
          {pool.length ? `${avail} de ${pool.length} disponibles` : 'Pool desconocido'}
        </span>
      </div>
      <div className="dchamps">
        {pool.map((e) => {
          const c = champMap.get(e.championId);
          const st = champStateFor(board, e.championId, side, player.id);
          const gray = st.kind !== 'available' && st.kind !== 'own';
          const tag =
            st.kind === 'ban'
              ? 'Ban'
              : st.kind === 'fearless'
                ? `G${st.game}`
                : st.kind === 'enemy'
                ? enemyLabel
                : st.kind === 'mate'
                  ? teamPlayers.find((p) => p.id === st.playerId)?.name ?? 'Tomado'
                  : st.kind === 'own'
                    ? 'Pick'
                    : null;
          const canClick = clickable && st.kind === 'available';
          const cls = [
            'dchamp',
            st.kind === 'ban' ? 'ban' : '',
            st.kind === 'fearless' ? 'fearless' : '',
            st.kind === 'own' ? 'own' : '',
            canClick ? 'clickable' : '',
            st.kind === 'available' && highlight === e.championId ? 'follow' : '',
            st.kind === 'available' && suggest.has(e.championId) ? 'suggest' : '',
          ].join(' ');
          return (
            <button
              key={e.championId}
              className={cls}
              disabled={!canClick}
              onClick={() => onChampion(e.championId)}
              title={`${c?.name ?? e.championId}${tag ? ` · ${tag}` : ''}${common.has(e.championId) ? ' · en ambos pools' : ''}`}
              style={{ opacity: 1 }}
            >
              <span className={`badge-prio${e.tier === 'comp' ? ' c' : ''}`}>{e.tier === 'top' ? e.priority : 'C'}</span>
              {common.has(e.championId) && st.kind === 'available' && <span className="marker">⚔️</span>}
              <ChampIcon champion={c} size={40} gray={gray} />
              {tag ? <span className="tag">{tag}</span> : <span className="cn">{c?.name ?? e.championId}</span>}
            </button>
          );
        })}
        {pool.length === 0 && <span className="small dim">Sin campeones cargados</span>}
      </div>
    </div>
  );
}

function GridChamp({
  champion,
  board,
  disabled,
  lockedGame,
  inPool,
  common,
  suggest,
  follow,
  onClick,
}: {
  champion: Champion;
  board: Board;
  disabled: boolean;
  lockedGame?: number;
  inPool: boolean;
  common: boolean;
  suggest: boolean;
  follow: boolean;
  onClick: () => void;
}) {
  const t = board.taken.get(champion.id);
  const off = !!t || !!lockedGame;
  const cls = ['gchamp', off ? 'taken' : '', !off && suggest ? 'suggest' : '', !off && follow ? 'follow' : ''].join(' ');
  return (
    <button
      className={cls}
      disabled={disabled}
      onClick={onClick}
      title={lockedGame ? `${champion.name} · fearless (partida ${lockedGame})` : champion.name}
    >
      {inPool && <span className="pool-dot" />}
      {common && !off && <span className="common-mark">⚔️</span>}
      <ChampIcon champion={champion} size={46} gray={off} />
      {lockedGame && !t ? <span className="ftag">G{lockedGame}</span> : <span className="cn">{champion.name}</span>}
    </button>
  );
}

function SaveDraftModal({ state, onClose }: { state: DraftState & { setup: DraftSetup }; onClose: () => void }) {
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const save = useApiMutation(
    () =>
      api.post('/drafts', {
        side: state.setup.ourSide === 'B' ? 'blue' : 'red',
        rivalTeamId: state.setup.rivalTeamId,
        ownLineup: state.setup.ownLineup,
        rivalLineup: state.setup.rivalTeamId ? state.setup.rivalLineup : null,
        actions: state.actions,
        result: result || null,
        notes,
      }),
    [['drafts']],
  );
  return (
    <Modal title="Guardar draft" onClose={onClose}>
      <div className="col">
        <label>
          <span>Resultado</span>
          <select value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="">Simulación / sin resultado</option>
            <option value="win">Victoria</option>
            <option value="loss">Derrota</option>
          </select>
        </label>
        <label>
          <span>Notas</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Qué funcionó, qué no…" />
        </label>
      </div>
      {save.isError && <p className="error small">{(save.error as Error).message}</p>}
      {save.isSuccess && <p className="ok small">Guardado. Lo ves en Historial.</p>}
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>{save.isSuccess ? 'Cerrar' : 'Cancelar'}</button>
        {!save.isSuccess && (
          <button className="primary" disabled={save.isPending} onClick={() => save.mutate(undefined)}>Guardar</button>
        )}
      </div>
    </Modal>
  );
}

function SeriesSummary({
  state,
  ownName,
  rivalName,
  onNew,
  onReopen,
}: {
  state: DraftState & { setup: DraftSetup };
  ownName: string;
  rivalName: string;
  onNew: () => void;
  onReopen: () => void;
}) {
  const champMap = useChampionMap();
  const { setup, games } = state;
  const score = seriesScore(games);
  const won = score.own > score.rival;
  return (
    <>
      <div className="page-head">
        <h1>{setup.format > 1 ? `Serie BO${setup.format} terminada` : 'Partida terminada'}</h1>
        <span className={`chip ${won ? 'green' : 'red'}`}>{won ? 'Victoria' : 'Derrota'}</span>
        <span className="series-score">
          {ownName} <b>{score.own}</b> – <b>{score.rival}</b> {rivalName}
        </span>
        <div className="spacer" />
        <button className="ghost" onClick={onReopen}>Volver a la partida {games.length}</button>
        <button className="primary" onClick={onNew}>Nueva serie</button>
      </div>
      <div className="col">
        {games.map((g, i) => {
          const b = buildBoard(g.actions);
          const theirs = otherSide(g.ourSide);
          return (
            <div key={i} className="panel">
              <div className="row" style={{ marginBottom: 8 }}>
                <h3>Partida {i + 1}</h3>
                <span className={`chip ${g.ourSide === 'B' ? 'blue' : 'red'}`}>{g.ourSide === 'B' ? 'Azul' : 'Rojo'}</span>
                <span className={`chip ${g.winner === 'own' ? 'green' : 'red'}`}>{g.winner === 'own' ? 'Ganamos' : 'Perdimos'}</span>
              </div>
              {[g.ourSide, theirs].map((side) => (
                <div key={side} className="row" style={{ gap: 4, marginBottom: 4 }}>
                  <span className="label" style={{ width: 70 }}>{side === g.ourSide ? ownName : rivalName}</span>
                  {b.picks[side].map((p) => <ChampIcon key={p.stepIndex} champion={champMap.get(p.championId)} size={34} />)}
                  <span className="dim small" style={{ marginLeft: 6 }}>ban</span>
                  {b.bans[side].map((x, j) => (x ? <ChampIcon key={j} champion={champMap.get(x)} size={22} gray /> : null))}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <p className="small muted">Cada partida quedó guardada en Historial.</p>
    </>
  );
}
