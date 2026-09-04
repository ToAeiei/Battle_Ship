import { createPortal } from 'react-dom';
import type { RoomView } from '@battleship/shared';
import { useGame } from '../net/store.js';
import { cx } from '../lib/ui.js';

/**
 * End-of-match card: Win / Lost, both scores, and the rematch handshake.
 * Both players must agree; the previous winner then fires first.
 */
export function ResultOverlay({ room }: { room: RoomView }) {
  const { session, rematch, leaveRoom } = useGame();
  const you = room.you;
  const opponent = room.opponent;
  const spectating = room.role === 'spectator';

  if (spectating) {
    const winner = room.sides.find((s) => s.id === room.winnerId);
    return createPortal(
      <div className="overlay">
        <div className="card result">
          <p className="eyebrow">Match over</p>
          <h2 className="result__verdict" style={{ fontSize: 34 }}>{winner?.nickname} wins</h2>
          <div className="result__scores">
            {room.sides.map((s) => (
              <div key={s.id}>
                <div className="result__score">{s.score}</div>
                <div className="muted" style={{ fontSize: 13 }}>{s.nickname}</div>
              </div>
            ))}
          </div>
          <button className="btn btn--block" onClick={leaveRoom}>Back to lobby</button>
        </div>
      </div>,
      document.body
    );
  }

  const won = room.winnerId === session?.playerId;
  const waiting = you?.wantsRematch && !opponent?.wantsRematch;

  return createPortal(
    <div className="overlay">
      <div className={cx('card result', won ? 'result--win' : 'result--lose')}>
        <p className="eyebrow">{won ? 'Enemy fleet destroyed' : 'Your fleet was destroyed'}</p>
        <h2 className="result__verdict">{won ? 'WIN' : 'LOST'}</h2>

        <div className="result__scores">
          <div>
            <div className="result__score" style={{ color: 'var(--gold)' }}>{you?.score ?? 0}</div>
            <div className="muted" style={{ fontSize: 13 }}>You</div>
          </div>
          <div className="faint" style={{ alignSelf: 'center', fontSize: 20 }}>–</div>
          <div>
            <div className="result__score">{opponent?.score ?? 0}</div>
            <div className="muted" style={{ fontSize: 13 }}>{opponent?.nickname}</div>
          </div>
        </div>

        <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
          {opponent?.wantsRematch && !you?.wantsRematch
            ? `${opponent.nickname} wants a rematch!`
            : waiting
              ? `Waiting for ${opponent?.nickname}…`
              : 'A rematch needs both commanders to agree. The winner fires first.'}
        </p>

        <div className="row">
          <button
            className="btn btn--primary grow"
            onClick={() => rematch(true)}
            disabled={!!you?.wantsRematch}
          >
            {waiting ? 'Waiting…' : 'Rematch'}
          </button>
          <button className="btn btn--ghost" onClick={leaveRoom}>Back to lobby</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
