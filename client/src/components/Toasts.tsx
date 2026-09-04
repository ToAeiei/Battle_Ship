import { useGame } from '../net/store.js';
import { cx } from '../lib/ui.js';

export function Toasts() {
  const { toasts, connected } = useGame();
  return (
    <>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('toast', `toast--${t.kind}`)}>{t.text}</div>
        ))}
      </div>
      {!connected && <div className="connlost">Lost connection to the server — reconnecting…</div>}
    </>
  );
}
