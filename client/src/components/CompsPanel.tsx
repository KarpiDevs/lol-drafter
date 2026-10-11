import { useChampionMap, type Player } from '../api';
import type { CompViability } from '../lib/draft';
import { ChampIcon } from './ChampIcon';

export const STYLE_LABEL: Record<string, string> = {
  engage: 'Engage',
  protect: 'Proteger',
  poke: 'Poke',
  early: 'Early',
  frontline: 'Frontline',
  otro: 'Otro',
};

const STATUS_CHIP = {
  viable: <span className="chip green">Viable</span>,
  replaced: <span className="chip orange">Con reemplazo</span>,
  broken: <span className="chip red">Rota</span>,
};

type Props = {
  viabilities: CompViability[];
  players: Player[];
  followingId: number | null;
  onFollow: (id: number | null) => void;
  hasRival: boolean;
};

/** Panel de viabilidad en vivo de las comps durante el draft. */
export function CompsPanel({ viabilities, players, followingId, onFollow, hasRival }: Props) {
  const champs = useChampionMap();
  const playerName = (id: number | null) => players.find((p) => p.id === id)?.name ?? '—';
  if (!viabilities.length) return <p className="muted">No hay comps cargadas. Crealas en la pantalla Comps.</p>;
  return (
    <div className="viability-list">
      {viabilities.map((v) => {
        const mismatches = v.slots.filter((s) => s.lineupMismatch && s.status.kind !== 'down');
        const following = followingId === v.comp.id;
        return (
          <div key={v.comp.id} className={`panel comp-card ${v.status}${following ? ' following' : ''}`}>
            <div className="row">
              <h3 className="grow">{v.comp.name}</h3>
              {STATUS_CHIP[v.status]}
              <span className="small muted">{v.ready} de 5 listos</span>
            </div>
            <div className="comp-slots">
              {v.slots.map((s) => {
                const shown = s.status.championId;
                const c = shown ? champs.get(shown) : undefined;
                const down = s.status.kind === 'down';
                const picked = s.status.kind !== 'down' && s.status.picked;
                return (
                  <div key={s.role} className={`comp-slot${down ? ' down' : ''}`}>
                    <span className="r">{s.role}</span>
                    <span style={{ position: 'relative' }}>
                      <ChampIcon champion={c} size={42} gray={down} />
                      {s.rivalRisk && hasRival && (
                        <span className="marker" title="También está en el pool del rival">⚔️</span>
                      )}
                    </span>
                    <span className="c" style={picked ? { color: 'var(--gold)' } : undefined}>{c?.name ?? '—'}</span>
                    {s.status.kind === 'alt' && (
                      <span className="alt">en vez de {champs.get(s.status.original)?.name}</span>
                    )}
                    <span className="p" style={s.lineupMismatch ? { color: 'var(--orange)' } : undefined}>{playerName(s.playerId)}</span>
                  </div>
                );
              })}
            </div>
            {mismatches.length > 0 && (
              <div className="small warn">
                Usa a {mismatches.map((s) => playerName(s.playerId)).join(', ')}, que no está en la alineación actual.
              </div>
            )}
            {hasRival && v.slots.some((s) => s.rivalRisk) && (
              <div className="small muted">⚔️ = también lo juega el rival: conviene pickearlo antes.</div>
            )}
            {v.comp.keyPoint && (
              <div className="comp-key"><b>Clave:</b> {v.comp.keyPoint}</div>
            )}
            {v.status !== 'broken' && (
              <button className={following ? 'primary' : ''} onClick={() => onFollow(following ? null : v.comp.id)}>
                {following ? 'Siguiendo · dejar de seguir' : 'Seguir esta comp'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
