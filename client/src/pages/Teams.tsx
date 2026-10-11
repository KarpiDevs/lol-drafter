import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useApiMutation, useConfig, useTeams, type Team } from '../api';
import { Modal } from '../components/Modal';

export type TeamForm = { name: string; shortName: string; faculty: string; notes: string };
export const emptyTeamForm: TeamForm = { name: '', shortName: '', faculty: '', notes: '' };

export function TeamFormFields({ form, setForm }: { form: TeamForm; setForm: (f: TeamForm) => void }) {
  const field = (k: keyof TeamForm) => ({ value: form[k], onChange: (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value }) });
  return (
    <div className="col">
      <div className="form-grid">
        <label><span>Nombre *</span><input {...field('name')} placeholder="Ingeniería" autoFocus /></label>
        <label><span>Abreviatura</span><input {...field('shortName')} placeholder="FIUNA" /></label>
      </div>
      <label><span>Facultad</span><input {...field('faculty')} placeholder="Facultad de Ingeniería (UNA)" /></label>
      <label><span>Notas de scouting</span><textarea {...field('notes')} placeholder="Estilo de juego, observaciones…" /></label>
    </div>
  );
}

export function TeamsPage() {
  const { data: teams, isLoading, error } = useTeams();
  const { data: config } = useConfig();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<TeamForm>(emptyTeamForm);
  const [syncMsg, setSyncMsg] = useState('');

  const create = useApiMutation((f: TeamForm) => api.post<Team>('/teams', f), [['teams']]);
  const sync = useApiMutation(
    (images: boolean) =>
      api.post<{ version: string; count: number; downloaded: number }>(`/champions/sync${images ? '?images=1' : ''}`),
    [['champions'], ['config']],
  );

  const runSync = (images: boolean) => {
    setSyncMsg(images ? 'Descargando íconos…' : 'Sincronizando…');
    sync.mutate(images, {
      onSuccess: (r) =>
        setSyncMsg(`${r.count} campeones · versión ${r.version}${images ? ` · ${r.downloaded} íconos nuevos` : ''}`),
      onError: (e) => setSyncMsg(`Error: ${(e as Error).message}`),
    });
  };

  return (
    <>
      <div className="page-head">
        <h1>Equipos</h1>
        <div className="spacer" />
        <button className="primary" onClick={() => { setForm(emptyTeamForm); setCreating(true); }}>
          Nuevo equipo
        </button>
      </div>

      {isLoading && <p className="muted">Cargando…</p>}
      {error && <p className="error">{(error as Error).message}. ¿Está levantada la API?</p>}

      <div className="cards">
        {teams?.map((t) => (
          <div key={t.id} className={`panel team-card${t.isOwn ? ' own' : ''}`} onClick={() => navigate(`/equipos/${t.id}`)}>
            <div className="row">
              <h2 className="grow">{t.name}</h2>
              {t.shortName && <span className="chip">{t.shortName}</span>}
              {t.isOwn && <span className="chip gold">Nuestro</span>}
            </div>
            {t.faculty && <div className="muted">{t.faculty}</div>}
            <div className="small dim">{t.playerCount} jugador{t.playerCount === 1 ? '' : 'es'}</div>
            {t.notes && <div className="small muted" style={{ whiteSpace: 'pre-wrap' }}>{t.notes}</div>}
          </div>
        ))}
      </div>

      <div className="panel" style={{ marginTop: 24 }}>
        <h3 style={{ marginBottom: 6 }}>Campeones (Data Dragon)</h3>
        <p className="small muted" style={{ margin: '0 0 10px' }}>
          Versión cargada: <b>{config?.ddragonVersion ?? '—'}</b>. Los íconos se guardan en <code>data/champions</code> a medida que se usan;
          descargalos todos antes de un torneo para que la app funcione sin internet.
        </p>
        <div className="row">
          <button onClick={() => runSync(false)} disabled={sync.isPending}>Actualizar lista</button>
          <button onClick={() => runSync(true)} disabled={sync.isPending}>Descargar todos los íconos</button>
          {syncMsg && <span className="small muted">{syncMsg}</span>}
        </div>
      </div>

      {creating && (
        <Modal title="Nuevo equipo" onClose={() => setCreating(false)}>
          <TeamFormFields form={form} setForm={setForm} />
          {create.isError && <p className="error small">{(create.error as Error).message}</p>}
          <div className="modal-actions">
            <button className="ghost" onClick={() => setCreating(false)}>Cancelar</button>
            <button
              className="primary"
              disabled={!form.name.trim() || create.isPending}
              onClick={() => create.mutate(form, { onSuccess: (t) => { setCreating(false); navigate(`/equipos/${t.id}`); } })}
            >
              Crear
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
