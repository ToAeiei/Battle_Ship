import { useEffect, useState } from 'react';
import { FEATURES } from '@battleship/shared';
import type { AdminState } from '@battleship/shared';
import { socket } from '../net/socket.js';
import { STATUS_TEXT, cx, initials, timeAgo } from '../lib/ui.js';

/**
 * -----------------------------------------------------------------------------
 * SERVER DASHBOARD  (http://<server>:3000/admin)
 * -----------------------------------------------------------------------------
 * Required by the assignment:
 *   · live count of concurrent connected clients
 *   · the list of those clients
 *   · a RESET button that clears the current games and every score
 * This page never joins the lobby, so opening it does not add a fake player.
 */
export function AdminScreen() {
  const [state, setState] = useState<AdminState | null>(null);
  const [authed, setAuthed] = useState(!FEATURES.ADMIN_KEY);
  const [key, setKey] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  const watch = (k: string) =>
    socket.emit('admin:watch', { key: k }, (r) => {
      if (r.ok) { setAuthed(true); setError(''); }
      else setError(r.error);
    });

  useEffect(() => {
    const onState = (s: AdminState) => setState(s);
    socket.on('admin:state', onState);
    const onConnect = () => watch(FEATURES.ADMIN_KEY ? key : '');
    socket.on('connect', onConnect);
    if (socket.connected) onConnect();
    return () => { socket.off('admin:state', onState); socket.off('connect', onConnect); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!authed) {
    return (
      <div className="join">
        <form
          className="card join__card"
          onSubmit={(e) => { e.preventDefault(); watch(key); }}
        >
          <p className="eyebrow">Restricted</p>
          <h1 style={{ fontSize: 26, marginBottom: 14 }}>Server dashboard</h1>
          <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Dashboard key" />
          {error && <p style={{ color: 'var(--hit)', fontSize: 13, marginTop: 8 }}>{error}</p>}
          <button className="btn btn--primary btn--block" style={{ marginTop: 14 }}>Unlock</button>
        </form>
      </div>
    );
  }

  const s = state;

  return (
    <div className="admin">
      <header className="admin__head">
        <div className="row">
          <span className="topbar__anchor" aria-hidden style={{ fontSize: 24 }}>⚓</span>
          <div>
            <div className="admin__title">BATTLESHIP · SERVER</div>
            <div className="faint" style={{ fontSize: 12 }}>
              {s ? `up ${timeAgo(s.serverStartedAt)}` : 'connecting…'}
            </div>
          </div>
        </div>
        <button className="btn btn--danger" onClick={() => setConfirming(true)}>
          ⟳ Reset games &amp; scores
        </button>
      </header>

      <div className="page stack">
        {/* --- stats ------------------------------------------------- */}
        <div className="stats">
          <div className="card stat">
            <p className="eyebrow">Clients online</p>
            <div className="stat__value stat__value--live">{s?.onlineCount ?? 0}</div>
          </div>
          <div className="card stat">
            <p className="eyebrow">Active matches</p>
            <div className="stat__value">{s?.rooms.length ?? 0}</div>
          </div>
          <div className="card stat">
            <p className="eyebrow">Matches played</p>
            <div className="stat__value">{s?.matchesPlayed ?? 0}</div>
          </div>
          <div className="card stat stat--wide">
            <p className="eyebrow">Join from any device</p>
            <div className="addrs" style={{ marginTop: 8 }}>
              {(s?.host.addresses ?? []).map((a) => (
                <span className="addr" key={a}>http://{a}:{s?.host.port}</span>
              ))}
            </div>
          </div>
        </div>

        {/* --- connected clients ------------------------------------- */}
        <section className="card">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Requirement · connected clients</p>
              <h2 style={{ fontSize: 18 }}>Client list</h2>
            </div>
            <span className="pill pill--live">{s?.clients.length ?? 0} registered</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nickname</th><th>Address</th><th>Socket</th><th>Status</th>
                  <th>Score</th><th>W/L</th><th>Connected</th><th />
                </tr>
              </thead>
              <tbody>
                {(s?.clients ?? []).map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="row">
                        <div className="avatar avatar--sm">{initials(c.nickname)}</div>
                        <strong>{c.nickname}</strong>
                      </div>
                    </td>
                    <td className="mono faint">{c.address}</td>
                    <td className="mono faint">{c.socketId.slice(0, 8)}</td>
                    <td>
                      <span className={cx('pill', c.status === 'away' ? 'pill--danger' : 'pill--live')}>
                        {STATUS_TEXT[c.status]}
                      </span>
                    </td>
                    <td className="mono">{c.score}</td>
                    <td className="mono faint">{c.wins}/{c.losses}</td>
                    <td className="faint">{timeAgo(c.connectedAt)} ago</td>
                    <td>
                      <button className="btn btn--sm btn--ghost" onClick={() => socket.emit('admin:kick', { playerId: c.id }, () => {})}>
                        Kick
                      </button>
                    </td>
                  </tr>
                ))}
                {!s?.clients.length && (
                  <tr><td colSpan={8}><div className="table__empty">No clients connected.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* --- matches ------------------------------------------------ */}
        <section className="card">
          <div className="panel__head">
            <div>
              <p className="eyebrow">Live</p>
              <h2 style={{ fontSize: 18 }}>Matches in progress</h2>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Room</th><th>Players</th><th>Phase</th><th>Spectators</th><th>Type</th></tr></thead>
              <tbody>
                {(s?.rooms ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="mono faint">{r.id.slice(0, 12)}</td>
                    <td><strong>{r.players.join('  vs  ')}</strong></td>
                    <td><span className="pill">{r.phase}</span></td>
                    <td className="mono">{r.spectators}</td>
                    <td className="faint">{r.vsBot ? 'vs AI' : 'player vs player'}</td>
                  </tr>
                ))}
                {!s?.rooms.length && (
                  <tr><td colSpan={5}><div className="table__empty">No matches running.</div></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {confirming && (
        <div className="overlay" onClick={() => setConfirming(false)}>
          <div className="card result" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 24 }}>Reset everything?</h2>
            <p className="muted" style={{ margin: '10px 0 20px' }}>
              This ends every match in progress and sets all players' scores back to 0.
            </p>
            <div className="row">
              <button
                className="btn btn--danger grow"
                onClick={() => { socket.emit('admin:reset', () => {}); setConfirming(false); }}
              >
                Yes, reset
              </button>
              <button className="btn btn--ghost" onClick={() => setConfirming(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
