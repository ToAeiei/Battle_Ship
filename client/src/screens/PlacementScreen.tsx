import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BOARD, canPlace, generateFleet, shipCells,
} from '@battleship/shared';
import type { CellIndex, Orientation, RoomView, Ship } from '@battleship/shared';
import { Board } from '../components/Board.js';
import { useGame } from '../net/store.js';
import { sfx } from '../lib/sfx.js';
import { cx, initials } from '../lib/ui.js';

const SHIP_IDS = Array.from({ length: BOARD.SHIP_COUNT }, (_, i) => `s${i}`);

/**
 * Step 3: deploy the fleet.
 * Interaction: pick a hull from the tray -> hover the grid to preview ->
 * click to drop. R rotates, right-click rotates, click a placed ship to move it.
 */
export function PlacementScreen({ room }: { room: RoomView }) {
  const { placeFleet, leaveRoom } = useGame();
  const [fleet, setFleet] = useState<Ship[]>([]);
  const [selected, setSelected] = useState<string | null>(SHIP_IDS[0]);
  const [orientation, setOrientation] = useState<Orientation>('h');
  const [hover, setHover] = useState<CellIndex | null>(null);
  const [bump, setBump] = useState(false);

  const submitted = room.you?.ready ?? false;
  const placedIds = useMemo(() => new Set(fleet.map((s) => s.id)), [fleet]);
  const nextUnplaced = SHIP_IDS.find((id) => !placedIds.has(id)) ?? null;

  /** Reset the draft whenever a new match (or rematch) starts. */
  useEffect(() => {
    setFleet([]);
    setSelected(SHIP_IDS[0]);
    setHover(null);
  }, [room.id, room.round]);

  const rotate = useCallback(() => {
    setOrientation((o) => (o === 'h' ? 'v' : 'h'));
    sfx.click();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') rotate();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rotate]);

  /* --- preview --------------------------------------------------------- */
  const preview = useMemo(() => {
    if (submitted || hover === null || !selected) return null;
    const cells = shipCells(hover, orientation);
    if (!cells) return { cells: [], ok: false };
    const ok = canPlace(fleet, { id: selected, origin: hover, orientation, cells });
    return { cells, ok };
  }, [hover, orientation, selected, fleet, submitted]);

  /* --- actions --------------------------------------------------------- */
  const drop = (cell: CellIndex) => {
    if (submitted || !selected) return;
    const cells = shipCells(cell, orientation);
    const candidate = cells && { id: selected, origin: cell, orientation, cells };
    if (!candidate || !canPlace(fleet, candidate)) {
      setBump(true);
      setTimeout(() => setBump(false), 420);
      return;
    }
    const next = [...fleet.filter((s) => s.id !== selected), candidate];
    setFleet(next);
    sfx.place();
    const remaining = SHIP_IDS.find((id) => !next.some((s) => s.id === id));
    setSelected(remaining ?? null);
  };

  /** Click a placed hull to pick it back up. */
  const pickUp = (cell: CellIndex) => {
    const ship = fleet.find((s) => s.cells.includes(cell));
    if (!ship || submitted) return false;
    setFleet((f) => f.filter((s) => s.id !== ship.id));
    setSelected(ship.id);
    setOrientation(ship.orientation);
    sfx.click();
    return true;
  };

  const randomise = () => {
    setFleet(generateFleet('random').map((s, i) => ({ ...s, id: SHIP_IDS[i] })));
    setSelected(null);
    sfx.place();
  };

  const clear = () => { setFleet([]); setSelected(SHIP_IDS[0]); };

  const ready = () => { sfx.click(); placeFleet(fleet); };

  const opponent = room.opponent;

  return (
    <div className="place">
      <div className="stack">
        <div className="spread">
          <div>
            <p className="eyebrow">Phase 1 of 2</p>
            <h2 style={{ fontSize: 22 }}>Deploy your fleet</h2>
          </div>
          <span className={cx('pill', submitted && 'pill--live')}>
            {fleet.length}/{BOARD.SHIP_COUNT} ships placed
          </span>
        </div>

        <div onContextMenu={(e) => { e.preventDefault(); rotate(); }}>
          <Board
            name="Your fleet — click to place ships"
            title="Your waters"
            marks={{}}
            ships={fleet}
            interactive={!submitted}
            preview={preview}
            shake={bump}
            onHover={setHover}
            onCell={(c) => { if (!pickUp(c)) drop(c); }}
          />
        </div>

        <p className="hintline">
          <kbd>R</kbd> or right-click to rotate · click a placed ship to move it
        </p>
      </div>

      {/* ---- fleet tray ------------------------------------------------ */}
      <aside className="card card--pad stack">
        <div>
          <p className="eyebrow">Your ships</p>
          <p className="muted" style={{ fontSize: 13 }}>
            {BOARD.SHIP_COUNT} ships × {BOARD.SHIP_LENGTH} connected slots
          </p>
        </div>

        <div className="tray">
          {SHIP_IDS.map((id, i) => {
            const isPlaced = placedIds.has(id);
            return (
              <button
                key={id}
                className={cx('tray__ship', selected === id && 'tray__ship--active', isPlaced && 'tray__ship--placed')}
                disabled={submitted}
                onClick={() => {
                  if (isPlaced) { setFleet((f) => f.filter((s) => s.id !== id)); }
                  setSelected(id);
                  sfx.click();
                }}
              >
                <span className="tray__hull" aria-hidden>
                  {Array.from({ length: BOARD.SHIP_LENGTH }, (_, k) => <i key={k} />)}
                </span>
                <span className="grow" style={{ textAlign: 'left', fontWeight: 650 }}>Ship {i + 1}</span>
                <span className="faint" style={{ fontSize: 12 }}>{isPlaced ? 'placed' : 'waiting'}</span>
              </button>
            );
          })}
        </div>

        <div className="row wrap">
          <button className="btn btn--sm" onClick={rotate} disabled={submitted}>
            ⟳ Rotate ({orientation === 'h' ? 'across' : 'down'})
          </button>
          <button className="btn btn--sm" onClick={randomise} disabled={submitted}>🎲 Randomise</button>
          <button className="btn btn--sm btn--ghost" onClick={clear} disabled={submitted || !fleet.length}>Clear</button>
        </div>

        <hr className="divider" />

        <button
          className="btn btn--primary btn--lg btn--block"
          disabled={submitted || fleet.length !== BOARD.SHIP_COUNT}
          onClick={ready}
        >
          {submitted ? 'Fleet locked in ✓' : 'Ready — lock fleet'}
        </button>

        {opponent && (
          <div className="row" style={{ fontSize: 13 }}>
            <div className={cx('avatar avatar--sm', opponent.isBot && 'avatar--bot')}>
              {initials(opponent.nickname)}
            </div>
            <span className="grow">{opponent.nickname}</span>
            <span className={cx('pill', opponent.ready && 'pill--live')}>
              {opponent.ready ? 'ready' : 'placing…'}
            </span>
          </div>
        )}

        <button className="btn btn--ghost btn--sm" onClick={leaveRoom}>Leave match</button>
      </aside>
    </div>
  );
}
