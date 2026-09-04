import { cellLabel } from '@battleship/shared';
import type { MoveLogEntry } from '@battleship/shared';
import { cx } from '../lib/ui.js';

/** Running record of every shot — handy when demoing the game. */
export function MoveLog({ log, youId }: { log: MoveLogEntry[]; youId: string | undefined }) {
  const rows = [...log].reverse();
  return (
    <div className="log scroll">
      {rows.length === 0 && <p className="faint" style={{ fontSize: 13 }}>No shots fired yet.</p>}
      {rows.map((m, i) => (
        <div className="log__row" key={`${m.at}-${i}`}>
          <span className={cx('log__mark', `log__mark--${m.mark}`)}>{m.mark.toUpperCase()}</span>
          <span className="mono">{cellLabel(m.cell)}</span>
          <span className="faint">
            {m.byPlayerId === youId ? 'you' : m.byNickname}{m.auto ? ' · auto' : ''}
          </span>
        </div>
      ))}
    </div>
  );
}
