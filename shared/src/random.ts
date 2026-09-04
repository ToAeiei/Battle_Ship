import { BOARD } from './config.js';
import { allPlacements, canPlace, neighbours } from './board.js';
import type { CellIndex, Ship } from './types.js';

/** Tiny helpers so every random decision goes through one place. */
export const randInt = (min: number, max: number) =>
  min + Math.floor(Math.random() * (max - min + 1));

export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const uid = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/**
 * Auto-placement.
 *  - 'random'  : any legal arrangement (the "Randomise" button).
 *  - 'spread'  : biased against clumping — harder for a hunting AI to unravel
 *                once it lands a hit, and what the bot uses for itself.
 */
export function generateFleet(strategy: 'random' | 'spread' = 'random'): Ship[] {
  for (let attempt = 0; attempt < 500; attempt++) {
    const fleet: Ship[] = [];
    const options = allPlacements();

    for (let n = 0; n < BOARD.SHIP_COUNT; n++) {
      const legal = options.filter((p) =>
        canPlace(fleet, { id: `s${n}`, origin: p.origin, orientation: p.orientation, cells: p.cells })
      );
      if (!legal.length) break;

      let chosen;
      if (strategy === 'spread') {
        const occupied = new Set(fleet.flatMap((s) => s.cells));
        const halo = new Set([...occupied].flatMap(neighbours));
        // Prefer placements that don't even touch an existing ship.
        const roomy = legal.filter((p) => !p.cells.some((c: CellIndex) => halo.has(c)));
        chosen = pick(roomy.length ? roomy : legal);
      } else {
        chosen = pick(legal);
      }

      fleet.push({
        id: `s${n}`,
        origin: chosen.origin,
        orientation: chosen.orientation,
        cells: chosen.cells,
      });
    }

    if (fleet.length === BOARD.SHIP_COUNT) return fleet;
  }
  throw new Error('Could not generate a fleet — check BOARD settings.');
}
