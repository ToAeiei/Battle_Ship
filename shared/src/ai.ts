import { BOARD, CELL_COUNT, type BotDifficulty } from './config.js';
import { allCells, allPlacements, neighbours, toRC } from './board.js';
import type { CellIndex, ShotMark } from './types.js';
import { pick, shuffle } from './random.js';

/**
 * -----------------------------------------------------------------------------
 * TARGETING AI  (used twice: by the bot opponent, and by the player's advisor)
 * -----------------------------------------------------------------------------
 * The core is a Monte-Carlo-free *probability density* search:
 *
 *   For every way a surviving 4-slot ship could still legally sit on the enemy
 *   board (given everything we have already learned), add a vote to each cell it
 *   would cover. Cells with the most votes are the most likely to hide a ship.
 *
 * On top of that sits the classic two-mode behaviour:
 *   HUNT   — no live hits on the board: shoot the densest cell (parity-aware,
 *            since a 4-long ship must cross every 4th diagonal).
 *   TARGET — we have wounded a ship: placements covering those hits are weighted
 *            enormously, which automatically produces "finish the line" play.
 */

export interface AiView {
  /** Everything the shooter knows about the enemy board. */
  marks: Record<CellIndex, ShotMark>;
  /** How many enemy ships are confirmed sunk. */
  shipsSunk: number;
}

export interface AiSuggestion {
  cell: CellIndex;
  /** Per-cell confidence 0..1 — the client paints this as a heat-map. */
  heat: number[];
  mode: 'hunt' | 'target';
  reason: string;
}

const { SHIP_LENGTH, SHIP_COUNT } = BOARD;

const isBlocked = (m: ShotMark | undefined) => m === 'miss' || m === 'sunk';
const isOpen = (marks: Record<CellIndex, ShotMark>, c: CellIndex) => marks[c] === undefined;

/** Cells we hit but whose ship has not been finished off yet. */
const liveHits = (marks: Record<CellIndex, ShotMark>): CellIndex[] =>
  allCells().filter((c) => marks[c] === 'hit');

/** Density map over all cells. Blocked / already-shot cells score 0. */
export function densityMap(view: AiView): number[] {
  const { marks } = view;
  const heat = new Array<number>(CELL_COUNT).fill(0);
  const wounded = liveHits(marks);
  const shipsLeft = Math.max(1, SHIP_COUNT - view.shipsSunk);

  for (const p of allPlacements()) {
    // A ship cannot sit on a known miss or on an already-sunk ship's hull.
    if (p.cells.some((c) => isBlocked(marks[c]))) continue;

    const covered = p.cells.filter((c) => marks[c] === 'hit').length;

    let weight: number;
    if (wounded.length === 0) {
      weight = 1;
    } else if (covered === 0) {
      // Still worth a sliver so the map never goes completely flat.
      weight = 0.01;
    } else {
      // Exponential: covering 2 known hits is far better than covering 1.
      weight = Math.pow(12, covered);
    }

    weight *= shipsLeft;

    for (const c of p.cells) if (isOpen(marks, c)) heat[c] += weight;
  }

  return heat;
}

/** Normalise to 0..1 for display. */
export const normalise = (heat: number[]): number[] => {
  const max = Math.max(...heat, 0);
  return max <= 0 ? heat.map(() => 0) : heat.map((v) => v / max);
};

/**
 * The advisor / "Admiral" brain. Deterministic apart from tie-breaking.
 */
export function suggestShot(view: AiView): AiSuggestion {
  const { marks } = view;
  const heat = densityMap(view);
  const wounded = liveHits(marks);
  const open = allCells().filter((c) => isOpen(marks, c));

  if (!open.length) {
    return { cell: 0, heat: normalise(heat), mode: 'hunt', reason: 'No cells left.' };
  }

  const best = Math.max(...open.map((c) => heat[c]));
  const tied = open.filter((c) => heat[c] === best);
  const cell = pick(tied);

  return {
    cell,
    heat: normalise(heat),
    mode: wounded.length ? 'target' : 'hunt',
    reason: wounded.length
      ? 'Finishing off a damaged ship — this square completes the most possible hulls.'
      : 'Highest density square: more surviving ships can fit through here than anywhere else.',
  };
}

/* ------------------------------------------------------------------ */
/* Difficulty wrappers used by the bot opponent                        */
/* ------------------------------------------------------------------ */

/** Random legal shot — the "easy" bot. */
function randomShot(marks: Record<CellIndex, ShotMark>): CellIndex {
  const open = allCells().filter((c) => isOpen(marks, c));
  return pick(open);
}

/**
 * Classic hunt/target with parity — the "normal" bot.
 * Strong enough to be fun, weak enough to be beatable.
 */
function huntTargetShot(marks: Record<CellIndex, ShotMark>): CellIndex {
  const wounded = liveHits(marks);

  if (wounded.length) {
    // If two hits line up, extend that line first.
    if (wounded.length >= 2) {
      const sorted = [...wounded].sort((a, b) => a - b);
      for (const a of sorted) {
        for (const b of sorted) {
          if (a >= b) continue;
          const ra = toRC(a), rb = toRC(b);
          const sameRow = ra.row === rb.row, sameCol = ra.col === rb.col;
          if (!sameRow && !sameCol) continue;
          const step = sameRow ? 1 : BOARD.SIZE;
          if ((b - a) % step !== 0) continue;
          const ends = [a - step, b + step].filter((c) => {
            if (c < 0 || c >= CELL_COUNT) return false;
            const rc = toRC(c);
            if (sameRow && rc.row !== ra.row) return false;
            if (sameCol && rc.col !== ra.col) return false;
            return isOpen(marks, c);
          });
          if (ends.length) return pick(ends);
        }
      }
    }
    const around = shuffle(wounded.flatMap(neighbours).filter((c) => isOpen(marks, c)));
    if (around.length) return around[0];
  }

  // Hunt on a parity lattice: a 4-long ship must touch one of these.
  const parity = allCells().filter((c) => {
    const { row, col } = toRC(c);
    return isOpen(marks, c) && (row + col) % SHIP_LENGTH === 0;
  });
  return parity.length ? pick(parity) : randomShot(marks);
}

export function botShot(view: AiView, difficulty: BotDifficulty): AiSuggestion {
  switch (difficulty) {
    case 'easy': {
      const cell = randomShot(view.marks);
      return { cell, heat: [], mode: 'hunt', reason: 'Random fire.' };
    }
    case 'normal': {
      const cell = huntTargetShot(view.marks);
      return { cell, heat: [], mode: liveHits(view.marks).length ? 'target' : 'hunt', reason: 'Hunt / target.' };
    }
    case 'admiral':
    default:
      return suggestShot(view);
  }
}

export const DIFFICULTY_LABELS: Record<BotDifficulty, { name: string; blurb: string }> = {
  easy: { name: 'Cadet', blurb: 'Fires at random. Good for a warm-up.' },
  normal: { name: 'Officer', blurb: 'Hunts on a parity lattice, then finishes what it wounds.' },
  admiral: { name: 'Admiral', blurb: 'Full probability-density search. Plays close to optimal.' },
};
