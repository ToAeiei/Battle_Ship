import { useState } from 'react';
import { FEATURES } from '@battleship/shared';
import type { RoomView, SideView } from '@battleship/shared';
import { Board } from '../components/Board.js';
import { Chat } from '../components/Chat.js';
import { FleetPips } from '../components/FleetPips.js';
import { MoveLog } from '../components/MoveLog.js';
import { TurnTimer } from '../components/TurnTimer.js';
import { ResultOverlay } from '../components/ResultOverlay.js';
import { useGame } from '../net/store.js';
import { cx, initials } from '../lib/ui.js';

/** Step 4: the battle itself. Also doubles as the spectator view. */
export function BattleScreen({ room }: { room: RoomView }) {
  const { session, fire, hint, askHint, clearHint, leaveRoom } = useGame();
  const [tab, setTab] = useState<'chat' | 'log'>('chat');
  const [showHeat, setShowHeat] = useState(false);

  const spectating = room.role === 'spectator';
  const you = room.you;
  const opponent = room.opponent;
  const myTurn = !spectating && room.turnPlayerId === session?.playerId && room.phase === 'playing';

  const left: SideView = you ?? room.sides[0];
  const right: SideView = opponent ?? room.sides[1];

  const turnName =
    room.phase !== 'playing'
      ? '—'
      : room.turnPlayerId === left.id ? left.nickname : right.nickname;

  return (
    <div className="battle">
      <div className="stack">
        {/* ---- scoreboard -------------------------------------------- */}
        <section className="card scoreboard">
          <SideCard side={left} you={!spectating} active={room.turnPlayerId === left.id} />
          <div className="turnbox">
            <TurnTimer endsAt={room.turnEndsAt} active={myTurn} />
            <span className="turnbox__label" style={{ color: myTurn ? 'var(--radar)' : 'var(--text-dim)' }}>
              {room.phase === 'finished' ? 'match over' : myTurn ? 'your shot' : `${turnName}'s turn`}
            </span>
          </div>
          <SideCard side={right} align="right" active={room.turnPlayerId === right.id} />
        </section>

        {/* ---- the two grids ------------------------------------------ */}
        <div className="boards">
          <Board
            name={spectating ? `${right.nickname}'s waters` : 'Enemy waters — click to fire'}
            title={spectating ? `${right.nickname}'s waters` : 'Enemy waters'}
            marks={right.marks}
            ships={right.ships}
            interactive={myTurn}
            lastCell={room.lastShot?.byPlayerId === left.id ? room.lastShot.cell : null}
            hintCell={hint?.cell ?? null}
            heat={showHeat && hint ? hint.heat : null}
            onCell={(c) => myTurn && fire(c)}
            right={<FleetPips sunk={right.shipsSunk} label={`${right.nickname}'s fleet`} />}
          />

          <Board
            small
            name={spectating ? `${left.nickname}'s waters` : 'Your fleet'}
            title={spectating ? `${left.nickname}'s waters` : 'Your fleet'}
            marks={left.marks}
            ships={left.ships}
            lastCell={room.lastShot?.byPlayerId === right.id ? room.lastShot.cell : null}
            right={<FleetPips sunk={left.shipsSunk} label={`${left.nickname}'s fleet`} />}
          />
        </div>

        {/* ---- AI advisor --------------------------------------------- */}
        {!spectating && (
          <section className="card card--pad row wrap">
            <span className="mode__icon" aria-hidden>🧠</span>
            <div className="grow" style={{ minWidth: 160 }}>
              <div style={{ fontWeight: 700 }}>AI shot advisor</div>
              <div className="muted" style={{ fontSize: 12.5 }}>
                Probability-density search over every place an enemy ship could still be hiding.
              </div>
            </div>
            {hint && (
              <button className="btn btn--sm btn--ghost" onClick={() => setShowHeat((v) => !v)} aria-pressed={showHeat}>
                {showHeat ? 'Hide heat-map' : 'Show heat-map'}
              </button>
            )}
            {hint && <button className="btn btn--sm btn--ghost" onClick={clearHint}>Clear</button>}
            <button className="btn btn--sm" disabled={!myTurn || room.hintsLeft === 0} onClick={askHint}>
              Ask advisor{FEATURES.HINTS_PER_MATCH >= 0 ? ` (${room.hintsLeft} left)` : ''}
            </button>
          </section>
        )}
      </div>

      {/* ---- right rail ------------------------------------------------ */}
      <aside className="rail">
        <div className="card">
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={tab === 'chat'} onClick={() => setTab('chat')}>Chat</button>
            <button role="tab" aria-selected={tab === 'log'} onClick={() => setTab('log')}>Shot log</button>
          </div>
          {tab === 'chat' ? <Chat /> : <MoveLog log={room.moveLog} youId={session?.playerId} />}
        </div>

        <div className="card card--pad stack" style={{ gap: 10 }}>
          <div className="spread">
            <span className="eyebrow">Match</span>
            <span className="pill">{room.vsBot ? 'vs AI' : 'online'}</span>
          </div>
          <Stat label="Your accuracy" value={accuracy(left)} />
          <Stat label="Opponent accuracy" value={accuracy(right)} />
          {room.spectators > 0 && <Stat label="Spectators" value={String(room.spectators)} />}
          <button className="btn btn--sm btn--ghost" onClick={leaveRoom}>
            {spectating ? 'Stop watching' : 'Leave match'}
          </button>
        </div>
      </aside>

      {room.phase === 'finished' && <ResultOverlay room={room} />}
    </div>
  );
}

const accuracy = (s: SideView) =>
  s.shotsFired ? `${Math.round((s.hits / s.shotsFired) * 100)}%  (${s.hits}/${s.shotsFired})` : '—';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="spread" style={{ fontSize: 13 }}>
      <span className="muted">{label}</span>
      <span className="mono">{value}</span>
    </div>
  );
}

function SideCard({ side, you, align, active }: { side: SideView; you?: boolean; align?: 'right'; active: boolean }) {
  return (
    <div className={cx('sidecard', align === 'right' && 'sidecard--right', active && 'sidecard--turn')}>
      <div className={cx('avatar', side.isBot && 'avatar--bot')}>{initials(side.nickname)}</div>
      <div>
        <div style={{ fontWeight: 700 }}>
          {side.nickname} {you && <span className="faint" style={{ fontWeight: 400 }}>(you)</span>}
          {!side.connected && <span className="pill pill--danger" style={{ marginLeft: 6 }}>offline</span>}
        </div>
        <div className="row" style={{ gap: 8, justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
          <span className="sidecard__score" style={{ color: 'var(--gold)' }}>{side.score}</span>
          <span className="faint" style={{ fontSize: 12 }}>points</span>
        </div>
      </div>
    </div>
  );
}
