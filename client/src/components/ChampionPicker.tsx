import { useMemo, useRef, useState } from 'react';
import { matchesSearch, useChampions, type Champion } from '../api';
import { ChampIcon } from './ChampIcon';

type Props = {
  onPick: (c: Champion) => void;
  placeholder?: string;
  /** Si se pasa, solo se ofrecen estos ids (ej. el pool de un jugador). */
  only?: string[];
  exclude?: Set<string>;
  disabled?: boolean;
};

/** Buscador con íconos: escribir, flechas para moverse, Enter para elegir. */
export function ChampionPicker({ onPick, placeholder = 'Agregar campeón…', only, exclude, disabled }: Props) {
  const { data: champions = [] } = useChampions();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const base = only ? champions.filter((c) => only.includes(c.id)) : champions;
    return base.filter((c) => !exclude?.has(c.id) && matchesSearch(c, q)).slice(0, 40);
  }, [champions, q, only, exclude]);

  const choose = (c: Champion) => {
    onPick(c);
    setQ('');
    setHl(0);
    inputRef.current?.focus();
  };

  return (
    <div className="picker">
      <input
        ref={inputRef}
        type="search"
        value={q}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setHl(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setHl((h) => Math.min(h + 1, results.length - 1));
          else if (e.key === 'ArrowUp') setHl((h) => Math.max(h - 1, 0));
          else if (e.key === 'Enter' && results[hl]) {
            e.preventDefault();
            choose(results[hl]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
        style={{ width: '100%' }}
      />
      {open && q && (
        <div className="picker-list">
          {results.length === 0 && <div className="muted small" style={{ padding: 6 }}>Sin resultados</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              type="button"
              className={`picker-item${i === hl ? ' hl' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
            >
              <ChampIcon champion={c} size={26} />
              {c.name}
              {c.nameEn && c.nameEn !== c.name && <span className="dim small">{c.nameEn}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
