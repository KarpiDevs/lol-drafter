import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ROLE_LABEL, ROLES, useApiMutation, useTeam, type Player, type Role } from '../api';
import { Modal } from '../components/Modal';
import { PoolEditor } from '../components/PoolEditor';
import { TeamFormFields, type TeamForm } from './Teams';

type PlayerForm = { name: string; role: Role; aliases: string; riotId: string; active: boolean };
const emptyPlayer = (role: Role = 'TOP'): PlayerForm => ({ name: '', role, aliases: '', riotId: '', active: true });

export function TeamDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { data: team, isLoading, error } = useTeam(id);
  const [editingTeam, setEditingTeam] = useState<TeamForm | null>(null);
  const [playerForm, setPlayerForm] = useState<{ id: number | null; form: PlayerForm } | null>(null);

  const inv = [['team', id], ['teams'], ['players']];
  const saveTeam = useApiMutation((f: TeamForm) => api.put(`/teams/${id}`, f), inv);
  const delTeam = useApiMutation(() => api.del(`/teams/${id}`), [['teams']]);
  const savePlayer = useApiMutation(
    ({ pid, form }: { pid: number | null; form: PlayerForm }) =>
      pid ? api.put(`/players/${pid}`, form) : api.post(`/teams/${id}/players`, form),
    inv,
  );
  const delPlayer = useApiMutation((pid: number) => api.del(`/players/${pid}`), [...inv, ['comps']]);
  const toggleActive = useApiMutation((p: Player) => api.put(`/players/${p.id}`, { active: !p.active }), inv);

  if (isLoading) return <p className="muted">Cargando…</p>;
  if (error || !team) return <p className="error">{(error as Error)?.message ?? 'Equipo no encontrado'}</p>;

  const byRole = (role: Role) => team.players.filter((p) => p.role === role);

  return (
    <>
      <div className="page-head">
        <Link to="/equipos" className="muted small">← Equipos</Link>
      </div>
      <div className="page-head">
        <h1>{team.name}</h1>
        {team.shortName && <span className="chip">{team.shortName}</span>}
        {team.isOwn && <span className="chip gold">Nuestro equipo</span>}
        <div className="spacer" />
        <button onClick={() => setEditingTeam({ name: team.name, shortName: team.shortName ?? '', faculty: team.faculty ?? '', notes: team.notes ?? '' })}>
          Editar equipo
        </button>
        {!team.isOwn && (
          <button
            className="danger"
            onClick={() => {
              if (confirm(`¿Borrar "${team.name}" con todos sus jugadores y pools? No se puede deshacer.`))
                delTeam.mutate(undefined, { onSuccess: () => navigate('/equipos') });
            }}
          >
            Borrar equipo
          </button>
        )}
        <button className="primary" onClick={() => setPlayerForm({ id: null, form: emptyPlayer() })}>
          Agregar jugador
        </button>
      </div>
      {team.faculty && <p className="muted" style={{ marginTop: -8 }}>{team.faculty}</p>}
      {team.notes && <div className="panel small" style={{ marginBottom: 16, whiteSpace: 'pre-wrap' }}>{team.notes}</div>}
      {team.players.length === 0 && (
        <div className="panel muted">
          Todavía no hay jugadores. Agregá uno por rol; si conocés 2 o 3 campeones de cada uno ya alcanza para el draft.
        </div>
      )}

      {ROLES.map((role) =>
        byRole(role).length ? (
          <section key={role} className="role-group">
            <h3>
              {ROLE_LABEL[role]} <span className="chip">{byRole(role).length}</span>
              <button className="sm ghost" onClick={() => setPlayerForm({ id: null, form: emptyPlayer(role) })}>+ jugador</button>
            </h3>
            <div className="cards">
              {byRole(role).map((p) => (
                <PoolEditor
                  key={`${p.id}:${JSON.stringify(p.pool)}`}
                  player={p}
                  header={
                    <div className="player-head">
                      <div className="grow">
                        <div className="name">{p.name}</div>
                        <div className="small muted">
                          {[p.aliases && `aka ${p.aliases}`, p.riotId].filter(Boolean).join(' · ') || ROLE_LABEL[p.role]}
                        </div>
                      </div>
                      {!p.active && <span className="chip">Suplente/inactivo</span>}
                      <button
                        className="sm ghost"
                        onClick={() =>
                          setPlayerForm({
                            id: p.id,
                            form: { name: p.name, role: p.role, aliases: p.aliases ?? '', riotId: p.riotId ?? '', active: p.active },
                          })
                        }
                      >
                        Editar
                      </button>
                      <button className="sm ghost" onClick={() => toggleActive.mutate(p)} title="Activo / inactivo">
                        {p.active ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          </section>
        ) : null,
      )}

      {editingTeam && (
        <Modal title="Editar equipo" onClose={() => setEditingTeam(null)}>
          <TeamFormFields form={editingTeam} setForm={setEditingTeam} />
          {saveTeam.isError && <p className="error small">{(saveTeam.error as Error).message}</p>}
          <div className="modal-actions">
            <button className="ghost" onClick={() => setEditingTeam(null)}>Cancelar</button>
            <button className="primary" disabled={!editingTeam.name.trim()} onClick={() => saveTeam.mutate(editingTeam, { onSuccess: () => setEditingTeam(null) })}>
              Guardar
            </button>
          </div>
        </Modal>
      )}

      {playerForm && (
        <Modal title={playerForm.id ? 'Editar jugador' : 'Nuevo jugador'} onClose={() => setPlayerForm(null)}>
          <div className="form-grid">
            <label>
              <span>Nombre *</span>
              <input autoFocus value={playerForm.form.name} onChange={(e) => setPlayerForm({ ...playerForm, form: { ...playerForm.form, name: e.target.value } })} />
            </label>
            <label>
              <span>Rol</span>
              <select value={playerForm.form.role} onChange={(e) => setPlayerForm({ ...playerForm, form: { ...playerForm.form, role: e.target.value as Role } })}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </label>
            <label>
              <span>Alias</span>
              <input value={playerForm.form.aliases} placeholder="Otros nombres" onChange={(e) => setPlayerForm({ ...playerForm, form: { ...playerForm.form, aliases: e.target.value } })} />
            </label>
            <label>
              <span>Riot ID</span>
              <input value={playerForm.form.riotId} placeholder="Nombre#TAG" onChange={(e) => setPlayerForm({ ...playerForm, form: { ...playerForm.form, riotId: e.target.value } })} />
            </label>
          </div>
          <label className="inline" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={playerForm.form.active} onChange={(e) => setPlayerForm({ ...playerForm, form: { ...playerForm.form, active: e.target.checked } })} />
            Activo
          </label>
          {savePlayer.isError && <p className="error small">{(savePlayer.error as Error).message}</p>}
          <div className="modal-actions">
            {playerForm.id && (
              <button
                className="danger"
                style={{ marginRight: 'auto' }}
                onClick={() => {
                  if (confirm(`¿Borrar a ${playerForm.form.name} y su pool?`))
                    delPlayer.mutate(playerForm.id!, { onSuccess: () => setPlayerForm(null) });
                }}
              >
                Borrar
              </button>
            )}
            <button className="ghost" onClick={() => setPlayerForm(null)}>Cancelar</button>
            <button
              className="primary"
              disabled={!playerForm.form.name.trim() || savePlayer.isPending}
              onClick={() => savePlayer.mutate({ pid: playerForm.id, form: playerForm.form }, { onSuccess: () => setPlayerForm(null) })}
            >
              Guardar
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
