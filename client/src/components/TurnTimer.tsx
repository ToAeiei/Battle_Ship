import { useEffect, useRef } from 'react';
import { TIMING } from '@battleship/shared';
import { useCountdown } from '../lib/useCountdown.js';
import { sfx } from '../lib/sfx.js';
import { cx } from '../lib/ui.js';

/**
 * The 10-second turn clock. The ring is cosmetic — the server holds the real
 * deadline and acts on it, so this can never be cheated by pausing JS.
 */
export function TurnTimer({ endsAt, active }: { endsAt: number | null; active: boolean }) {
  const lastTick = useRef(-1);
  const left = useCountdown(endsAt, (s) => {
    if (active && s <= 3 && s > 0 && s !== lastTick.current) {
      lastTick.current = s;
      sfx.tick();
    }
  });

  const total = TIMING.TURN_SECONDS;
  const pct = endsAt ? Math.max(0, Math.min(1, left / total)) : 1;
  const R = 32;
  const C = 2 * Math.PI * R;
  const seconds = Math.ceil(left);

  return (
    <div
      className={cx('timer', !!endsAt && seconds <= 5 && 'timer--warn', !!endsAt && seconds <= 3 && 'timer--crit')}
      role="timer"
      aria-label={`${seconds} seconds left this turn`}
    >
      <svg viewBox="0 0 74 74" aria-hidden>
        <circle className="timer__track" cx="37" cy="37" r={R} />
        <circle
          className="timer__bar"
          cx="37" cy="37" r={R}
          strokeDasharray={C}
          strokeDashoffset={C * (1 - pct)}
        />
      </svg>
      <span className="timer__num mono">{endsAt ? seconds : '—'}</span>
    </div>
  );
}
