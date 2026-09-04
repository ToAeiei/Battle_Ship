import { useEffect, useState } from 'react';

/**
 * Counts down to a server-supplied epoch timestamp.
 * The server owns the real deadline; this is purely for display, so a laggy
 * client can never gain or lose time.
 */
export function useCountdown(endsAt: number | null, onTick?: (secondsLeft: number) => void) {
  const [left, setLeft] = useState(() => remaining(endsAt));

  useEffect(() => {
    setLeft(remaining(endsAt));
    if (endsAt === null) return;
    const id = setInterval(() => {
      const r = remaining(endsAt);
      setLeft(r);
      onTick?.(Math.ceil(r));
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  return left;
}

const remaining = (endsAt: number | null) =>
  endsAt === null ? 0 : Math.max(0, (endsAt - Date.now()) / 1000);
