import { useState } from 'react';
import { champIcon, type Champion } from '../api';

type Props = { champion?: Champion; size?: number; gray?: boolean; title?: string };

export function ChampIcon({ champion, size = 40, gray, title }: Props) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={`champ-icon${gray ? ' gray' : ''}`}
      style={{ width: size, height: size }}
      title={title ?? champion?.name}
    >
      {champion && !failed ? (
        <img src={champIcon(champion)} alt={champion.name} loading="lazy" onError={() => setFailed(true)} />
      ) : (
        <span className="fallback" style={{ fontSize: size * 0.4 }}>
          {champion?.name.slice(0, 2) ?? '?'}
        </span>
      )}
    </span>
  );
}
