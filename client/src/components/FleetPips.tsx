import { BOARD } from '@battleship/shared';
import { cx } from '../lib/ui.js';

/** Four little hulls: filled = afloat, red = sunk. */
export function FleetPips({ sunk, label }: { sunk: number; label: string }) {
  return (
    <div className="row" style={{ gap: 8 }}>
      <span className="fleetpips" role="img" aria-label={`${label}: ${BOARD.SHIP_COUNT - sunk} of ${BOARD.SHIP_COUNT} ships afloat`}>
        {Array.from({ length: BOARD.SHIP_COUNT }, (_, i) => (
          <i key={i} className={cx(i < sunk && 'gone')} />
        ))}
      </span>
      <span className="faint mono" style={{ fontSize: 12 }}>
        {BOARD.SHIP_COUNT - sunk}/{BOARD.SHIP_COUNT}
      </span>
    </div>
  );
}
