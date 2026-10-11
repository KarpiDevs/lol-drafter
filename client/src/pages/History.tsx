import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  api,
  ROLES,
  sortPool,
  useApiMutation,
  useChampionMap,
  useDrafts,
  usePlayerHistory,
  useTeam,
  useTeams,
  type SavedDraft,
} from '../api';
import { ChampIcon } from '../components/ChampIcon';
import { storeDraftState } from './Draft';
import { buildBoard, SEQUENCE, type Lineup, type Side } from '../lib/draft';

const fmt = (iso: string) => new Date(iso).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' });

export function HistoryPage() {
  const [tab, setTab] = useState<'drafts' | 'pools'>('drafts');
  return (
    <>
      <div className="page-head"><h1>Historial</h1></div>
      <div className="tabs">
        <button className={tab === 'drafts' ? 'active' : ''} onClick={() => setTab('drafts')}>Drafts guardados</button>
        <button className={tab === 'pools' ? 'active' : ''} onClick={() => setTab('pools')}>Cambios de pools</button>
      </div>
      {tab === 'drafts' ? <DraftsList /> : <PoolHistory />}
    </>
  );
}

function DraftsList() {
  const { data: drafts = [], isLoading } = useDrafts();
  const { data: teams = [] } = useTeams();
  const champs = useChampionMap();
  const navigate = useNavigate();
  const [rival, setRival] = useState('');
  const del = useApiMutation((id: number) => api.del(`/drafts/${id}`), [['drafts']]);

  const teamName = (id: number | null) => (id ? teams.find((t) => t.id === id)?.name ?? 'Equipo borrado' : 'Rival genérico');
  const list = drafts.filter((d) => !rival || String(d.rivalTeamId ?? 'none') === rival);

  const open = (d: SavedDraft) => {
    storeDraftState({
      setup: {
        ourSide: d.side === 'blue' ? 'B' : 'R',
        ownLineup: d.ownLineupJson as Lineup,
        rivalTeamId: d.rivalTeamId,
        rivalLineup: (d.rivalLineupJson ?? { TOP: null, JG: null, MID: null, ADC: null, SUPP: null }) as Lineup,
        format: 1,
        fearless: 'hard',
      },
      editing: false,
      games: [],
      actions: d.actionsJson.slice(0, SEQUENCE.length),
    });
    navigate('/draft');
  };

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={rival} onChange={(e) => setRival(e.target.value)}>
          <option value="">Todos los rivales</option>
          <option value="none">Rival genérico</option>
          {teams.filter((t) => !t.isOwn).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      {isLoading && <p className="muted">Cargando…</p>}
      {!isLoading && list.length === 0 && <p className="muted">No hay drafts guardados. Usá "Guardar draft" en el simulador.</p>}
      <div className="viability-list">
        {list.map((d) => {
          const board = buildBoard(d.actionsJson);
          const ours: Side = d.side === 'blue' ? 'B' : 'R';
          const theirs: Side = ours === 'B' ? 'R' : 'B';
          return (
            <div key={d.id} className="panel comp-card">
              <div className="row">
                <h3 className="grow">vs {teamName(d.rivalTeamId)}</h3>
                <span className={`chip ${d.side === 'blue' ? 'blue' : 'red'}`}>{d.side === 'blue' ? 'Azul' : 'Rojo'}</span>
                {d.result === 'win' && <span className="chip green">Victoria</span>}
                {d.result === 'loss' && <span className="chip red">Derrota</span>}
              </div>
              <div className="small dim">{fmt(d.createdAt)} · {d.actionsJson.length}/20 pasos</div>
              {[ours, theirs].map((side) => (
                <div key={side} className="row" style={{ gap: 4 }}>
                  <span className="label" style={{ width: 70 }}>{side === ours ? 'Nosotros' : 'Rival'}</span>
                  {board.picks[side].map((p) => <ChampIcon key={p.stepIndex} champion={champs.get(p.championId)} size={30} />)}
                  <span className="dim small" style={{ marginLeft: 6 }}>ban</span>
                  {board.bans[side].map((b, i) => (b ? <ChampIcon key={i} champion={champs.get(b)} size={22} gray /> : null))}
                </div>
              ))}
              {d.notes && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{d.notes}</div>}
              <div className="row">
                <button className="sm" onClick={() => open(d)}>Abrir en el simulador</button>
                <button className="sm danger" onClick={() => confirm('¿Borrar este draft?') && del.mutate(d.id)}>Borrar</button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function PoolHistory() {
  const { data: teams = [] } = useTeams();
  const [teamId, setTeamId] = useState<number | null>(null);
  const tid = teamId ?? teams.find((t) => t.isOwn)?.id ?? null;
  const { data: team } = useTeam(tid);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const list = team?.players ?? [];
  const { data: history = [], isLoading } = usePlayerHistory(playerId);
  const champs = useChampionMap();

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={tid ?? ''} onChange={(e) => { setTeamId(Number(e.target.value)); setPlayerId(null); }}>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={playerId ?? ''} onChange={(e) => setPlayerId(e.target.value ? Number(e.target.value) : null)}>
          <option value="">Elegí un jugador…</option>
          {ROLES.flatMap((r) => list.filter((p) => p.role === r)).map((p) => <option key={p.id} value={p.id}>{p.role} · {p.name}</option>)}
        </select>
      </div>
      {!playerId && <p className="muted">Los snapshots se guardan al tildar "Guardar en historial" cuando guardás un pool.</p>}
      {playerId && isLoading && <p className="muted">Cargando…</p>}
      {playerId && !isLoading && history.length === 0 && <p className="muted">Este jugador no tiene snapshots guardados.</p>}
      <div className="col">
        {history.map((h) => (
          <div key={h.id} className="panel">
            <div className="row" style={{ marginBottom: 6 }}>
              <b>{h.note || 'Sin nota'}</b>
              <span className="small dim">{fmt(h.createdAt)}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              {sortPool(h.snapshotJson).map((e) => (
                <span key={e.championId} className="col" style={{ alignItems: 'center', gap: 0 }}>
                  <ChampIcon champion={champs.get(e.championId)} size={34} />
                  <span className="small" style={{ color: e.tier === 'top' ? 'var(--gold)' : 'var(--muted)' }}>
                    {e.tier === 'top' ? e.priority : 'C'}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
