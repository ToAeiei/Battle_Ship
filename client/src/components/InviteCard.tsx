import { useEffect, useState } from 'react';
import { useGame } from '../net/store.js';
import { initials } from '../lib/ui.js';
import { serverTime } from '../lib/clock.js';

/** Incoming challenge, with a live expiry countdown. */
export function InviteCard() {
  const { invite, respond } = useGame();
  const [left, setLeft] = useState(0);

  useEffect(() => {
    if (!invite) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((invite.expiresAt - serverTime()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [invite]);

  // Auto-decline only once the invite has genuinely expired. (Checking the
  // rendered countdown instead would fire on the first render, when it is
  // still at its initial 0.)
  useEffect(() => {
    if (invite && serverTime() >= invite.expiresAt) respond(invite.fromId, false);
  }, [left, invite, respond]);

  if (!invite) return null;

  return (
    <div className="card card--pad invite" role="alertdialog" aria-label="Challenge received">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="avatar">{initials(invite.fromNickname)}</div>
        <div className="grow">
          <strong>{invite.fromNickname}</strong>
          <div className="muted" style={{ fontSize: 13 }}>challenges you to a battle</div>
        </div>
        <span className="pill mono">{left}s</span>
      </div>
      <div className="row">
        <button className="btn btn--primary grow" onClick={() => respond(invite.fromId, true)}>Accept</button>
        <button className="btn btn--ghost" onClick={() => respond(invite.fromId, false)}>Decline</button>
      </div>
    </div>
  );
}
