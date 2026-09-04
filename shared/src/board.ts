import { BOARD, CELL_COUNT, TOTAL_SHIP_CELLS } from './config.js';
import type { CellIndex, Orientation, Ship, ShotMark, ShotResult } from './types.js';

/**
 * Pure board rules. No sockets, no React, no randomness that isn't injected.
 * Both the server (authority) and the client (preview/AI) call into here, which
 * is why the two can never disagree about what is legal.
 */

const { SIZE, SHIP_LENGTH, SHIP_COUNT, ALLOW_ADJACENT_SHIPS } = BOARD;

/* --- coordinates ------------------------------------------------------ */

export const toRC = (i: CellIndex) => ({ row: Math.floor(i / SIZE), col: i % SIZE });
export const toIndex = (row: number, col: number): CellIndex => row * SIZE + col;
export const inBounds = (row: number, col: number) =>
  row >= 0 && row < SIZE && col >= 0 && col < SIZE;

/** "A1" .. "H8" — columns are letters, rows are numbers (matches the UI). */
export const cellLabel = (i: CellIndex) => {
  const { row, col } = toRC(i);
  return `${String.fromCharCode(65 + col)}${row + 1}`;
};

export const allCells = (): CellIndex[] =>
  Array.from({ length: CELL_COUNT }, (_, i) => i);

/** The (up to 4) orthogonal neighbours of a cell. */
export const neighbours = (i: CellIndex): CellIndex[] => {
  const { row, col } = toRC(i);
  return [
    [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1],
  ]
    .filter(([r, c]) => inBounds(r, c))
    .map(([r, c]) => toIndex(r, c));
};

/* --- ship geometry ---------------------------------------------------- */

/** The cells a ship of SHIP_LENGTH would cover, or null if it runs off-board. */
export function shipCells(
  origin: CellIndex,
  orientation: Orientation,
  length = SHIP_LENGTH
): CellIndex[] | null {
  const { row, col } = toRC(origin);
  const cells: CellIndex[] = [];
  for (let n = 0; n < length; n++) {
    const r = orientation === 'v' ? row + n : row;
    const c = orientation === 'h' ? col + n : col;
    if (!inBounds(r, c)) return null;
    cells.push(toIndex(r, c));
  }
  return cells;
}

export const makeShip = (
  id: string,
  origin: CellIndex,
  orientation: Orientation
): Ship | null => {
  const cells = shipCells(origin, orientation);
  return cells ? { id, origin, orientation, cells } : null;
};

/** Every legal origin+orientation on an empty board. */
export function allPlacements(): { origin: CellIndex; orientation: Orientation; cells: CellIndex[] }[] {
  const out: { origin: CellIndex; orientation: Orientation; cells: CellIndex[] }[] = [];
  for (const origin of allCells()) {
    for (const orientation of ['h', 'v'] as Orientation[]) {
      const cells = shipCells(origin, orientation);
      if (cells) out.push({ origin, orientation, cells });
    }
  }
  return out;
}

/* --- validation ------------------------------------------------------- */

export interface FleetCheck {
  ok: boolean;
  error?: string;
  /** Ids of ships that clash — the UI paints these red. */
  conflicts: string[];
}

/** Can this one ship be dropped here given the ships already down? */
export function canPlace(fleet: Ship[], candidate: Ship): boolean {
  const taken = new Set(fleet.filter((s) => s.id !== candidate.id).flatMap((s) => s.cells));
  if (candidate.cells.some((c) => taken.has(c))) return false;
  if (!ALLOW_ADJACENT_SHIPS) {
    const blocked = new Set([...taken].flatMap(neighbours));
    if (candidate.cells.some((c) => blocked.has(c))) return false;
  }
  return true;
}

/** Full server-side validation of a submitted fleet. Never trust the client. */
export function validateFleet(ships: Ship[]): FleetCheck {
  if (!Array.isArray(ships) || ships.length !== SHIP_COUNT)
    return { ok: false, error: `You must place exactly ${SHIP_COUNT} ships.`, conflicts: [] };

  const seen = new Map<CellIndex, string>();
  const conflicts = new Set<string>();

  for (const ship of ships) {
    const geo = shipCells(ship.origin, ship.orientation);
    if (!geo || geo.length !== SHIP_LENGTH) {
      conflicts.add(ship.id);
      continue;
    }
    // Recompute cells server-side rather than trusting ship.cells.
    for (const c of geo) {
      const owner = seen.get(c);
      if (owner !== undefined) {
        conflicts.add(ship.id);
        conflicts.add(owner);
      } else {
        seen.set(c, ship.id);
      }
    }
  }

  if (!ALLOW_ADJACENT_SHIPS) {
    for (const ship of ships) {
      for (const c of ship.cells) {
        for (const n of neighbours(c)) {
          const owner = seen.get(n);
          if (owner && owner !== ship.id) {
            conflicts.add(ship.id);
            conflicts.add(owner);
          }
        }
      }
    }
  }

  if (conflicts.size)
    return { ok: false, error: 'Ships overlap or fall off the grid.', conflicts: [...conflicts] };
  return { ok: true, conflicts: [] };
}

/** Normalise a fleet so `cells` always matches `origin`/`orientation`. */
export const normaliseFleet = (ships: Ship[]): Ship[] =>
  ships.map((s) => ({ ...s, cells: shipCells(s.origin, s.orientation) ?? [] }));

/* --- firing ----------------------------------------------------------- */

/**
 * Resolve a shot against a defender's fleet.
 * `marks` is the shooter's existing knowledge and is NOT mutated.
 */
export function resolveShot(
  defenderShips: Ship[],
  marks: Record<CellIndex, ShotMark>,
  cell: CellIndex
): ShotResult {
  const ship = defenderShips.find((s) => s.cells.includes(cell));
  if (!ship) return { cell, mark: 'miss' };

  const hitCells = new Set(
    Object.entries(marks)
      .filter(([, m]) => m === 'hit' || m === 'sunk')
      .map(([k]) => Number(k))
  );
  hitCells.add(cell);

  const sunk = ship.cells.every((c) => hitCells.has(c));
  return sunk
    ? { cell, mark: 'sunk', sunkShipCells: ship.cells }
    : { cell, mark: 'hit' };
}

export const countSunkShips = (ships: Ship[], marks: Record<CellIndex, ShotMark>) =>
  ships.filter((s) => s.cells.every((c) => marks[c] === 'hit' || marks[c] === 'sunk')).length;

export const isFleetDestroyed = (ships: Ship[], marks: Record<CellIndex, ShotMark>) =>
  countSunkShips(ships, marks) === SHIP_COUNT;

export const hitCount = (marks: Record<CellIndex, ShotMark>) =>
  Object.values(marks).filter((m) => m === 'hit' || m === 'sunk').length;

export const remainingShipCells = (marks: Record<CellIndex, ShotMark>) =>
  TOTAL_SHIP_CELLS - hitCount(marks);

export const isCellShot = (marks: Record<CellIndex, ShotMark>, cell: CellIndex) =>
  marks[cell] !== undefined;
