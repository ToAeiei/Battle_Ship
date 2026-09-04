import { useState, type ReactNode } from 'react';
import { useGame } from '../net/store.js';
import { setSoundEnabled, soundEnabled } from '../lib/sfx.js';
import { getTheme, initials, setTheme } from '../lib/ui.js';
import { cx } from '../lib/ui.js';

export function TopBar({ right }: { right?: ReactNode }) {
  const { session, connected, lobby } = useGame();
  const [sound, setSound] = useState(soundEnabled());
  const [theme, setThemeState] = useState(getTheme());

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="topbar__anchor" aria-hidden>⚓</span>
        <span>BATTLESHIP</span>
      </div>

      <span className={cx('pill', connected && 'pill--live')} title="Socket connection">
        <span className={cx('dot', connected ? 'dot--on' : 'dot--off')} />
        {connected ? `${lobby.online} online` : 'offline'}
      </span>

      <div className="grow" />
      {right}

      <button
        className="btn btn--ghost btn--sm"
        onClick={() => { const v = !sound; setSound(v); setSoundEnabled(v); }}
        aria-pressed={sound}
        title="Sound effects"
      >
        {sound ? '🔊' : '🔇'}
      </button>
      <button className="btn btn--ghost btn--sm" onClick={toggleTheme} title="Light / dark theme">
        {theme === 'dark' ? '🌙' : '☀️'}
      </button>

      {session && (
        <div className="row" title="You">
          <div className="avatar avatar--sm">{initials(session.nickname)}</div>
          <div style={{ lineHeight: 1.15 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{session.nickname}</div>
            <div className="faint mono" style={{ fontSize: 11 }}>
              score {lobby.players.find((p) => p.id === session.playerId)?.score ?? session.score}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
