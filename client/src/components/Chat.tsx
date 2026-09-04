import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useGame } from '../net/store.js';
import { cx } from '../lib/ui.js';

const EMOTES = ['👋', '🔥', '😅', '🫡', '💥', '🎯', '🤝', '😱'];

/** Room chat + quick emotes. Also carries the server's system commentary. */
export function Chat() {
  const { chat, sendChat, session } = useGame();
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [chat.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    sendChat(t);
    setText('');
  };

  return (
    <div className="chat">
      <div className="chat__log scroll" ref={logRef} aria-live="polite">
        {chat.length === 0 && <p className="faint" style={{ fontSize: 13 }}>Say hello to your opponent…</p>}
        {chat.map((m) => (
          <div key={m.id} className={cx('chat__msg', `chat__msg--${m.kind}`)}>
            {m.kind === 'system' ? (
              <>▸ {m.text}</>
            ) : m.kind === 'emote' ? (
              <>
                <span className="chat__who" style={{ fontSize: 13 }}>{m.fromNickname}</span>{' '}
                <span>{m.text}</span>
              </>
            ) : (
              <>
                <span className="chat__who">
                  {m.fromId === session?.playerId ? 'You' : m.fromNickname}
                </span>{' '}
                {m.text}
              </>
            )}
          </div>
        ))}
      </div>
      <div className="emotes">
        {EMOTES.map((e) => (
          <button key={e} type="button" onClick={() => sendChat(e, 'emote')} aria-label={`Send ${e}`}>{e}</button>
        ))}
      </div>
      <form className="chat__form" onSubmit={submit}>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          maxLength={200}
          aria-label="Chat message"
        />
        <button className="btn btn--sm" type="submit" disabled={!text.trim()}>Send</button>
      </form>
    </div>
  );
}
