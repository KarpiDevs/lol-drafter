import { useState } from 'react';
import {
  api,
  ROLE_LABEL,
  ROLES,
  sortPool,
  useApiMutation,
  useChampionMap,
  useComps,
  useOwnTeam,
  type Comp,
  type CompSlot,
  type Player,
  type Role,
} from '../api';
import { ChampIcon } from '../components/ChampIcon';
import { STYLE_LABEL } from '../components/CompsPanel';
import { Modal } from '../components/Modal';

type Draft = {
  id: number | null;
  name: string;
  style: string;
  gamePlan: string;
  keyPoint: string;
  active: boolean;
  slots: Record<Role, { playerId: number | null; championId: string | null; alternatives: string[] }>;
};

const toDraft = (c?: Comp): Draft => ({
  id: c?.id ?? null,
  name: c?.name ?? '',
  style: c?.style ?? 'engage',
  gamePlan: c?.gamePlan ?? '',
  keyPoint: c?.keyPoint ?? '',
  active: c?.active ?? true,
  slots: Object.fromEntries(
    ROLES.map((r) => {
      const s = c?.slots.find((x) => x.role === r);
      return [r, { playerId: s?.playerId ?? null, championId: s?.championId ?? null, alternatives: s?.alternatives ?? [] }];
    }),
  ) as Draft['slots'],
});

const inPool = (p: Player | undefined, id: string | null) => !!p && !!id && p.pool.some((e) => e.championId === id);

export function CompsPage() {
  const { data: comps = [], isLoading } = useComps();
  const own = useOwnTeam();
  const players = own.data?.players ?? [];
  const champs = useChampionMap();
  const [style, setStyle] = useState('');
  const [editing, setEditing] = useState<Draft | null>(null);

  const save = useApiMutation((d: Draft) => {
    const body = {
      name: d.name,
      style: d.style,
      gamePlan: d.gamePlan,
      keyPoint: d.keyPoint,
      active: d.active,
      slots: ROLES.map((role) => ({ role, playerId: d.slots[role].playerId, championId: d.slots[role].championId })),
      alternatives: ROLES.flatMap((role) =>
        d.slots[role].alternatives.filter(Boolean).map((championId, i) => ({ role, championId, priority: i + 1 })),
      ),
    };
    return d.id ? api.put(`/comps/${d.id}`, body) : api.post('/comps', body);
  }, [['comps']]);
  const del = useApiMutation((id: number) => api.del(`/comps/${id}`), [['comps']]);

  const styles = [...new Set(comps.map((c) => c.style))];
  const list = comps.filter((c) => !style || c.style === style);

  return (
    <>
      <div className="page-head">
        <h1>Comps</h1>
        <select value={style} onChange={(e) => setStyle(e.target.value)}>
          <option value="">Todos los estilos</option>
          {styles.map((s) => <option key={s} value={s}>{STYLE_LABEL[s] ?? s}</option>)}
        </select>
        <div className="spacer" />
        <button className="primary" onClick={() => setEditing(toDraft())}>Nueva comp</button>
      </div>
      {isLoading && <p className="muted">Cargando…</p>}

      <div className="viability-list">
        {list.map((c) => (
          <div key={c.id} className={`panel comp-card${c.active ? '' : ' broken'}`}>
            <div className="row">
              <h3 className="grow">{c.name}</h3>
              <span className="chip gold">{STYLE_LABEL[c.style] ?? c.style}</span>
              {!c.active && <span className="chip">Inactiva</span>}
            </div>
            <div className="comp-slots">
              {c.slots.map((s) => (
                <SlotView key={s.role} slot={s} players={players} champs={champs} />
              ))}
            </div>
            {c.gamePlan && <div className="comp-plan">{c.gamePlan}</div>}
            {c.keyPoint && <div className="comp-key"><b>Clave:</b> {c.keyPoint}</div>}
            <div className="row">
              <button className="sm" onClick={() => setEditing(toDraft(c))}>Editar</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <Modal title={editing.id ? 'Editar comp' : 'Nueva comp'} onClose={() => setEditing(null)}>
          <div className="col">
            <div className="form-grid">
              <label><span>Nombre *</span><input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
              <label>
                <span>Estilo</span>
                <select value={editing.style} onChange={(e) => setEditing({ ...editing, style: e.target.value })}>
                  {Object.entries(STYLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            {ROLES.map((role) => (
              <SlotEditor
                key={role}
                role={role}
                value={editing.slots[role]}
                players={players}
                champs={champs}
                onChange={(v) => setEditing({ ...editing, slots: { ...editing.slots, [role]: v } })}
              />
            ))}
            <label><span>Plan de juego</span><textarea value={editing.gamePlan} onChange={(e) => setEditing({ ...editing, gamePlan: e.target.value })} /></label>
            <label><span>Clave</span><input value={editing.keyPoint} onChange={(e) => setEditing({ ...editing, keyPoint: e.target.value })} /></label>
            <label className="inline">
              <input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />
              Activa (aparece en el draft)
            </label>
          </div>
          {save.isError && <p className="error small">{(save.error as Error).message}</p>}
          <div className="modal-actions">
            {editing.id && (
              <button
                className="danger"
                style={{ marginRight: 'auto' }}
                onClick={() => confirm(`¿Borrar la comp "${editing.name}"?`) && del.mutate(editing.id!, { onSuccess: () => setEditing(null) })}
              >
                Borrar
              </button>
            )}
            <button className="ghost" onClick={() => setEditing(null)}>Cancelar</button>
            <button className="primary" disabled={!editing.name.trim() || save.isPending} onClick={() => save.mutate(editing, { onSuccess: () => setEditing(null) })}>
              Guardar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function SlotView({ slot, players, champs }: { slot: CompSlot; players: Player[]; champs: ReturnType<typeof useChampionMap> }) {
  const p = players.find((x) => x.id === slot.playerId);
  const c = slot.championId ? champs.get(slot.championId) : undefined;
  const outOfPool = slot.championId && p && !inPool(p, slot.championId);
  return (
    <div className="comp-slot">
      <span className="r">{slot.role}</span>
      <ChampIcon champion={c} size={42} />
      <span className="c">{c?.name ?? '—'}</span>
      <span className="p">{p?.name ?? '—'}</span>
      {outOfPool && <span className="alt" title="Ya no está en el pool del jugador">fuera del pool</span>}
      {slot.alternatives.length > 0 && (
        <span className="p" title="Alternativas">alt: {slot.alternatives.map((a) => champs.get(a)?.name ?? a).join(', ')}</span>
      )}
    </div>
  );
}

function SlotEditor({
  role,
  value,
  players,
  champs,
  onChange,
}: {
  role: Role;
  value: Draft['slots'][Role];
  players: Player[];
  champs: ReturnType<typeof useChampionMap>;
  onChange: (v: Draft['slots'][Role]) => void;
}) {
  const rolePlayers = players.filter((p) => p.role === role);
  const player = players.find((p) => p.id === value.playerId);
  const pool = player ? sortPool(player.pool) : [];
  const options = (current: string | null) => {
    const ids = pool.map((e) => e.championId);
    // Mantener visible un campeón que ya no está en el pool, para avisar
    if (current && !ids.includes(current)) ids.unshift(current);
    return ids;
  };
  const label = (id: string) => {
    const e = pool.find((x) => x.championId === id);
    const n = champs.get(id)?.name ?? id;
    return e ? `${e.tier === 'top' ? e.priority : 'C'} · ${n}` : `${n} (fuera del pool)`;
  };
  const alts = [value.alternatives[0] ?? '', value.alternatives[1] ?? ''];

  return (
    <div className="panel" style={{ padding: 10 }}>
      <div className="row">
        <span className="label" style={{ width: 60 }}>{ROLE_LABEL[role]}</span>
        <ChampIcon champion={value.championId ? champs.get(value.championId) : undefined} size={32} />
        <select
          value={value.playerId ?? ''}
          onChange={(e) => onChange({ playerId: e.target.value ? Number(e.target.value) : null, championId: null, alternatives: [] })}
        >
          <option value="">Jugador…</option>
          {rolePlayers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          className="grow"
          value={value.championId ?? ''}
          disabled={!player}
          onChange={(e) => onChange({ ...value, championId: e.target.value || null })}
        >
          <option value="">Campeón…</option>
          {options(value.championId).map((id) => <option key={id} value={id}>{label(id)}</option>)}
        </select>
      </div>
      {value.championId && player && !inPool(player, value.championId) && (
        <div className="small warn" style={{ marginTop: 4 }}>
          {champs.get(value.championId)?.name} ya no está en el pool de {player.name}.
        </div>
      )}
      {player && (
        <div className="row" style={{ marginTop: 6 }}>
          <span className="small muted" style={{ width: 60 }}>Alternativas</span>
          {alts.map((a, i) => (
            <select
              key={i}
              className="grow"
              value={a}
              onChange={(e) => {
                const next = [...alts];
                next[i] = e.target.value;
                onChange({ ...value, alternatives: next.filter(Boolean) });
              }}
            >
              <option value="">—</option>
              {options(a || null)
                .filter((id) => id !== value.championId)
                .map((id) => <option key={id} value={id}>{label(id)}</option>)}
            </select>
          ))}
        </div>
      )}
    </div>
  );
}
