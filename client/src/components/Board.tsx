import { memo, useMemo, type ReactNode } from 'react';
import { BOARD, allCells, cellLabel, toRC } from '@battleship/shared';
import type { CellIndex, Ship, ShotMark } from '@battleship/shared';
import { cx } from '../lib/ui.js';

export interface BoardProps {
  /** Shots landed on THIS board. */
  marks: Record<CellIndex, ShotMark>;
  /** Ships to draw. null = hidden (enemy waters). */
  ships?: Ship[] | null;
  small?: boolean;
  interactive?: boolean;
  onCell?: (cell: CellIndex) => void;
  onHover?: (cell: CellIndex | null) => void;
  /** Ghost outline while dragging a ship into place. */
  preview?: { cells: CellIndex[]; ok: boolean } | null;
  /** AI advisor highlight. */
  hintCell?: CellIndex | null;
  /** AI advisor probability map, 0..1 per cell. */
  heat?: number[] | null;
  /** Most recent shot, ringed in gold. */
  lastCell?: CellIndex | null;
  shake?: boolean;
  title?: string;
  /** Spoken to screen readers, e.g. "Enemy waters". */
  name: string;
  right?: ReactNode;
}

const N = BOARD.SIZE;
const LETTERS = Array.from({ length: N }, (_, i) => String.fromCharCode(65 + i));

/**
 * One 8x8 grid. Used for your own fleet, enemy waters, placement and the
 * spectator view — the differences are all props, so there is only one grid
 * implementation to keep correct.
 */
function BoardImpl({
  marks, ships, small, interactive, onCell, onHover, preview,
  hintCell, heat, lastCell, shake, title, name, right,
}: BoardProps) {
  /** cell -> rounded-end class, so a 4-slot hull looks like one object. */
  const hull = useMemo(() => {
    const map = new Map<CellIndex, string>();
    for (const s of ships ?? []) {
      s.cells.forEach((c, i) => {
        const first = i === 0, last = i === s.cells.length - 1;
        const v = s.orientation === 'v';
        map.set(
          c,
          cx('cell--ship',
            first && (v ? 'cell--ship-headv' : 'cell--ship-head'),
            last && (v ? 'cell--ship-tailv' : 'cell--ship-tail'))
        );
      });
    }
    return map;
  }, [ships]);

  const previewSet = useMemo(() => new Set(preview?.cells ?? []), [preview]);

  return (
    <div className="boardwrap">
      {(title || right) && (
        <div className="boardwrap__title">
          <span className="eyebrow">{title}</span>
          {right}
        </div>
      )}
      <div
        className={cx('board', small && 'board--sm', shake && 'board--shake', !interactive && 'board--locked')}
        role="grid"
        aria-label={name}
        onPointerLeave={() => onHover?.(null)}
      >
        <div className="board__axis" aria-hidden />
        {LETTERS.map((l) => (
          <div key={l} className="board__axis" aria-hidden>{l}</div>
        ))}

        {allCells().map((cell) => {
          const { row, col } = toRC(cell);
          const mark = marks[cell];
          const isPreview = previewSet.has(cell);
          const heatValue = heat?.[cell] ?? 0;

          const node = (
            <button
              key={cell}
              type="button"
              role="gridcell"
              className={cx(
                'cell',
                hull.get(cell),
                mark === 'miss' && 'cell--miss',
                mark === 'hit' && 'cell--hit',
                mark === 'sunk' && 'cell--sunk',
                interactive && !mark && 'cell--clickable',
                isPreview && (preview!.ok ? 'cell--ok' : 'cell--bad'),
                hintCell === cell && 'cell--hint',
                lastCell === cell && 'cell--last'
              )}
              disabled={!interactive}
              aria-label={`${cellLabel(cell)}${mark ? `, ${mark}` : ''}`}
              onClick={() => onCell?.(cell)}
              onPointerEnter={() => onHover?.(cell)}
              onFocus={() => onHover?.(cell)}
            >
              {heat && heatValue > 0.08 && !mark && (
                <span className="cell__heat" style={{ opacity: Math.min(0.55, heatValue * 0.55) }} />
              )}
            </button>
          );

          return col === 0
            ? [
                <div key={`r${row}`} className="board__axis" aria-hidden>{row + 1}</div>,
                node,
              ]
            : node;
        })}
      </div>
    </div>
  );
}

export const Board = memo(BoardImpl);
