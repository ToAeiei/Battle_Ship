import { useState, type FormEvent } from 'react';
import { useGame } from '../net/store.js';
import { serverLabel } from '../net/socket.js';
import { sfx } from '../lib/sfx.js';

/**
 * Step 1: nickname only. The server address is auto-detected (shown just so a
 * demo audience can see it was never typed in).
 */
export function JoinScreen() {
  const { join, connected, joining, savedNickname } = useGame();
  const [name, setName] = useState(savedNickname);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    sfx.click();
    join(name.trim());
  };

  return (
    <div className="join">
      <form className="card join__card" onSubmit={submit}>
        <div className="join__seas" aria-hidden><div className="join__radar" /></div>

        <p className="eyebrow">Naval command · online</p>
        <h1 className="join__title">Battleship</h1>
        <p className="muted" style={{ marginTop: 10, marginBottom: 22 }}>
          8×8 grid · 4 ships · 10 seconds a turn. Sink the enemy fleet first.
        </p>

        <label className="eyebrow" htmlFor="nick">Your nickname</label>
        <input
          id="nick"
          className="input"
          style={{ marginTop: 6 }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alice"
          maxLength={16}
          autoFocus
          autoComplete="off"
        />

        <button
          className="btn btn--primary btn--lg btn--block"
          style={{ marginTop: 16 }}
          type="submit"
          disabled={!connected || joining || !name.trim()}
        >
          {connected ? (joining ? 'Joining…' : 'Enter the fleet') : 'Connecting to server…'}
        </button>

        <p className="faint" style={{ marginTop: 16, fontSize: 12 }}>
          Server: <span className="mono">{serverLabel()}</span> — no IP or port to type.
        </p>
      </form>
    </div>
  );
}
