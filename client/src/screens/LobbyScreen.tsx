import type { ReactNode } from 'react';
import { DIFFICULTY_LABELS } from '@battleship/shared';
import type { BotDifficulty } from '@battleship/shared';
import { useGame } from '../net/store.js';
import { STATUS_TEXT, cx, initials, timeAgo } from '../lib/ui.js';

const DIFFICULTIES: BotDifficulty[] = ['easy', 'normal', 'admiral'];
const DIFF_ICON: Record<BotDifficulty, string> = { easy: '🎲', normal: '🎯', admiral: '🧠' };

/**
 * Step 2: the lobby. This is the screen that satisfies "the client connects to
 * the server first and receives information about the other connected clients".
 */
export function LobbyScreen() {
  const { lobby, session, challenge, setQueued, playBot, spectate } = useGame();
  const me = lobby.players.find((p) => p.id === session?.playerId);
  const queued = me?.status === 'queued';
  const others = lobby.players.filter((p) => p.id !== session?.playerId);

  return (
    <>
      <div className="welcome">
        <p className="eyebrow">Signed in</p>
        <h1 className="welcome__title">
          Welcome, <span>{session?.nickname}</span>.
        </h1>
        <p className="muted">
          {me ? `Score ${me.score} · ${me.wins}W / ${me.losses}L` : 'Loading your record…'}
          {' · '}You are connected to the game server.
        </p>
      </div>

    <div className="lobby">
      {/* ---- who else is connected ---------------------------------- */}
      <section className="card">
        <div className="panel__head">
          <div>
            <p className="eyebrow">Connected clients</p>
            <h2 style={{ fontSize: 19 }}>Commanders online</h2>
          </div>
          <span className="pill pill--live">{lobby.online} online</span>
        </div>

        <div className="panel__body">
          <div className="plist scroll">
            {me && <PlayerRow p={me} isMe />}
            {others.map((p) => (
              <PlayerRow
                key={p.id}
                p={p}
                action={
                  <button
                    className="btn btn--sm"
                    disabled={p.status !== 'idle' && p.status !== 'queued'}
                    onClick={() => challenge(p.id)}
                  >
                    Challenge
                  </button>
                }
              />
            ))}
            {others.length === 0 && (
              <p className="plist__empty">
                No one else yet.<br />
                <span style={{ fontSize: 13 }}>
                  Open the game on another computer, or take on the AI →
                </span>
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---- how to start a match ------------------------------------ */}
      <div className="stack">
        <section className="card">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Start a battle</p>
              <h2 style={{ fontSize: 19 }}>Choose your match</h2>
            </div>
          </div>
          <div className="panel__body">
            <div className="modes">
              <button
                className={cx('mode', queued && 'mode--active')}
                onClick={() => setQueued(!queued)}
              >
                <span className="mode__icon">{queued ? '📡' : '⚔️'}</span>
                <span className="grow">
                  <span className="mode__title">{queued ? 'Searching for an opponent…' : 'Quick match'}</span>
                  <span className="mode__blurb">
                    {queued ? 'Tap again to cancel. You are paired automatically.' : 'Get paired with the next player who queues up.'}
                  </span>
                </span>
                {queued && <span className="pill pill--live">queued</span>}
              </button>

              <hr className="divider" />
              <p className="eyebrow" style={{ padding: '2px 2px 0' }}>Play against the AI</p>

              {DIFFICULTIES.map((d) => (
                <button key={d} className="mode" onClick={() => playBot(d)}>
                  <span className="mode__icon">{DIFF_ICON[d]}</span>
                  <span className="grow">
                    <span className="mode__title">{DIFFICULTY_LABELS[d].name}</span>
                    <span className="mode__blurb">{DIFFICULTY_LABELS[d].blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ---- live matches you can watch --------------------------- */}
        <section className="card">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Spectate</p>
              <h2 style={{ fontSize: 19 }}>Live matches</h2>
            </div>
            <span className="pill">{lobby.rooms.length}</span>
          </div>
          <div className="panel__body stack" style={{ gap: 8 }}>
            {lobby.rooms.length === 0 && <p className="plist__empty" style={{ padding: 16 }}>Nothing in progress.</p>}
            {lobby.rooms.map((r) => (
              <div className="matchrow" key={r.id}>
                <span className="grow" style={{ fontWeight: 650, fontSize: 13.5 }}>
                  {r.players.join('  vs  ')}
                </span>
                <span className="pill">{r.phase}</span>
                <button className="btn btn--sm" onClick={() => spectate(r.id)}>Watch</button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
    </>
  );
}

function PlayerRow({
  p, isMe, action,
}: {
  p: { id: string; nickname: string; score: number; status: keyof typeof STATUS_TEXT; wins: number; losses: number; connectedAt: number };
  isMe?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={cx('plist__row', isMe && 'plist__row--me')}>
      <div className="avatar avatar--sm">{initials(p.nickname)}</div>
      <div className="grow">
        <div className="plist__name">
          {p.nickname} {isMe && <span className="faint" style={{ fontWeight: 400 }}>(you)</span>}
        </div>
        <div className="plist__meta">
          {STATUS_TEXT[p.status]} · {p.wins}W / {p.losses}L · connected {timeAgo(p.connectedAt)} ago
        </div>
      </div>
      <span className="pill" title="Score">★ {p.score}</span>
      {action}
    </div>
  );
}
