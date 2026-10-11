import { useState, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  api,
  resolveChampion,
  sortPool,
  useApiMutation,
  useChampionMap,
  useChampions,
  useConfig,
  type Player,
  type PoolEntry,
  type Tier,
} from '../api';
import { ChampIcon } from './ChampIcon';
import { ChampionPicker } from './ChampionPicker';

type Lists = Record<Tier, string[]>;

const toLists = (pool: PoolEntry[]): Lists => {
  const sorted = sortPool(pool);
  return {
    top: sorted.filter((e) => e.tier === 'top').map((e) => e.championId),
    comp: sorted.filter((e) => e.tier === 'comp').map((e) => e.championId),
  };
};

export function PoolEditor({ player, header }: { player: Player; header?: ReactNode }) {
  const { data: config } = useConfig();
  const max: Record<Tier, number> = { top: config?.maxTop ?? 5, comp: config?.maxComp ?? 3 };
  const { data: champions = [] } = useChampions();

  const [lists, setLists] = useState<Lists>(() => toLists(player.pool));
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [snapshot, setSnapshot] = useState(false);
  const [note, setNote] = useState('');

  const update = (next: Lists) => {
    setLists(next);
    setDirty(true);
    setMessage(null);
  };

  const save = useApiMutation(
    () =>
      api.put<Player>(`/players/${player.id}/pool`, {
        pool: (['top', 'comp'] as Tier[]).flatMap((tier) =>
          lists[tier].map((championId, i) => ({ championId, tier, priority: i + 1 })),
        ),
        snapshot,
        note,
      }),
    [['team', player.teamId], ['players'], ['history', player.id]],
  );

  const all = new Set([...lists.top, ...lists.comp]);

  const add = (ids: string[]) => {
    const next = { top: [...lists.top], comp: [...lists.comp] };
    const skipped: string[] = [];
    for (const id of ids) {
      if (next.top.includes(id) || next.comp.includes(id)) continue;
      if (next.top.length < max.top) next.top.push(id);
      else if (next.comp.length < max.comp) next.comp.push(id);
      else skipped.push(id);
    }
    update(next);
    return skipped;
  };

  const remove = (id: string) => update({ top: lists.top.filter((x) => x !== id), comp: lists.comp.filter((x) => x !== id) });

  const moveTo = (id: string, tier: Tier) => {
    if (lists[tier].length >= max[tier]) {
      setMessage({ kind: 'warn', text: `La lista ${tier === 'top' ? 'Top' : 'Complementarios'} está llena (máx. ${max[tier]})` });
      return;
    }
    const from: Tier = tier === 'top' ? 'comp' : 'top';
    update({ [from]: lists[from].filter((x) => x !== id), [tier]: [...lists[tier], id] } as Lists);
  };

  const applyPaste = () => {
    const parts = pasteText.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    const unresolved: string[] = [];
    const ids: string[] = [];
    for (const p of parts) {
      const c = resolveChampion(p, champions);
      if (c) ids.push(c.id);
      else unresolved.push(p);
    }
    const skipped = add(ids);
    const notes = [];
    if (unresolved.length) notes.push(`No reconocidos: ${unresolved.join(', ')}`);
    if (skipped.length) notes.push(`Sin lugar (pool lleno): ${skipped.length}`);
    setMessage(notes.length ? { kind: 'warn', text: notes.join('. ') } : { kind: 'ok', text: `${ids.length} agregados` });
    setPasteText('');
    if (!unresolved.length) setPasteOpen(false);
  };

  // ---------- drag and drop ----------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const containerOf = (id: string): Tier | undefined =>
    id === 'top' || id === 'comp' ? id : lists.top.includes(id) ? 'top' : lists.comp.includes(id) ? 'comp' : undefined;

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return;
    const from = containerOf(String(active.id));
    const to = containerOf(String(over.id));
    if (!from || !to || from === to) return;
    if (lists[to].length >= max[to]) return;
    const id = String(active.id);
    const overIndex = lists[to].indexOf(String(over.id));
    const target = [...lists[to]];
    target.splice(overIndex >= 0 ? overIndex : target.length, 0, id);
    update({ [from]: lists[from].filter((x) => x !== id), [to]: target } as Lists);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const tier = containerOf(String(active.id));
    if (!tier || tier !== containerOf(String(over.id))) return;
    const oldIndex = lists[tier].indexOf(String(active.id));
    const newIndex = lists[tier].indexOf(String(over.id));
    if (oldIndex !== newIndex && newIndex >= 0) update({ ...lists, [tier]: arrayMove(lists[tier], oldIndex, newIndex) });
  };

  return (
    <div className={`panel player-card${player.active ? '' : ' inactive'}`}>
      {header}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        {(['top', 'comp'] as Tier[]).map((tier) => (
          <PoolList key={tier} tier={tier} ids={lists[tier]} max={max[tier]} onRemove={remove} onMove={moveTo} />
        ))}
      </DndContext>

      <ChampionPicker onPick={(c) => {
        const skipped = add([c.id]);
        if (skipped.length) setMessage({ kind: 'warn', text: 'El pool está lleno' });
      }} exclude={all} />

      {pasteOpen ? (
        <div className="col">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Garen, Darius, Sett"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) applyPaste();
            }}
          />
          <div className="row">
            <button className="sm" onClick={applyPaste} disabled={!pasteText.trim()}>Agregar lista</button>
            <button className="sm ghost" onClick={() => setPasteOpen(false)}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button className="sm ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setPasteOpen(true)}>
          Pegar lista de texto
        </button>
      )}

      {message && <div className={`small ${message.kind === 'ok' ? 'ok' : message.kind === 'warn' ? 'warn' : 'error'}`}>{message.text}</div>}
      {save.isError && <div className="small error">{(save.error as Error).message}</div>}

      <div className="row">
        <label className="inline small">
          <input type="checkbox" checked={snapshot} onChange={(e) => setSnapshot(e.target.checked)} />
          Guardar en historial
        </label>
        {snapshot && (
          <input className="grow" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (ej.: práctica 12/10)" />
        )}
      </div>
      <div className="row">
        <button
          className="primary"
          disabled={!dirty || save.isPending}
          onClick={() =>
            save.mutate(undefined, {
              onSuccess: () => {
                setDirty(false);
                setSnapshot(false);
                setNote('');
                setMessage({ kind: 'ok', text: 'Pool guardado' });
              },
            })
          }
        >
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        {dirty && (
          <>
            <span className="dirty-dot" title="Cambios sin guardar" />
            <button className="sm ghost" onClick={() => { setLists(toLists(player.pool)); setDirty(false); setMessage(null); }}>
              Descartar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PoolList({
  tier,
  ids,
  max,
  onRemove,
  onMove,
}: {
  tier: Tier;
  ids: string[];
  max: number;
  onRemove: (id: string) => void;
  onMove: (id: string, tier: Tier) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });
  return (
    <div className="col" style={{ gap: 4 }}>
      <div className="label">
        {tier === 'top' ? `Top ${max}` : 'Complementarios'} <span className="dim">({ids.length}/{max})</span>
      </div>
      <SortableContext id={tier} items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={`pool-list${isOver ? ' over' : ''}`}>
          {ids.length === 0 && <div className="dim small" style={{ padding: '8px 4px' }}>Arrastrá o agregá campeones</div>}
          {ids.map((id, i) => (
            <PoolItem key={id} id={id} tier={tier} index={i} onRemove={onRemove} onMove={onMove} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function PoolItem({
  id,
  tier,
  index,
  onRemove,
  onMove,
}: {
  id: string;
  tier: Tier;
  index: number;
  onRemove: (id: string) => void;
  onMove: (id: string, tier: Tier) => void;
}) {
  const champ = useChampionMap().get(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const stop = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation(), onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation() };
  return (
    <div
      ref={setNodeRef}
      className={`pool-item${isDragging ? ' dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <span className={`prio${tier === 'comp' ? ' c' : ''}`}>{tier === 'top' ? index + 1 : 'C'}</span>
      <ChampIcon champion={champ} size={28} />
      <span className="nm">{champ?.name ?? id}</span>
      <button
        className="icon ghost sm"
        title={tier === 'top' ? 'Pasar a complementarios' : 'Pasar al Top'}
        onClick={() => onMove(id, tier === 'top' ? 'comp' : 'top')}
        {...stop}
      >
        {tier === 'top' ? '↓' : '↑'}
      </button>
      <button className="icon ghost sm" title="Quitar" onClick={() => onRemove(id)} {...stop}>
        ✕
      </button>
    </div>
  );
}
