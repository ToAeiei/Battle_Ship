import type { PlayerStatus } from '@battleship/shared';

export const initials = (name: string) =>
  name
    .split(/[^\p{L}\p{N}]+/u)      // ignore brackets, dots, etc.
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

export const STATUS_TEXT: Record<PlayerStatus, string> = {
  idle: 'In lobby',
  queued: 'Looking for a match',
  playing: 'In battle',
  spectating: 'Watching',
  away: 'Reconnecting…',
};

export const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};

export const cx = (...parts: (string | false | null | undefined)[]) =>
  parts.filter(Boolean).join(' ');

/** Theme is persisted so it survives a refresh mid-demo. */
export const getTheme = (): 'dark' | 'light' =>
  (localStorage.getItem('bs.theme') as 'dark' | 'light') || 'dark';

export const setTheme = (t: 'dark' | 'light') => {
  localStorage.setItem('bs.theme', t);
  document.documentElement.dataset.theme = t;
};
