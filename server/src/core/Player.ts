import type { PlayerStatus } from '@battleship/shared';

/** Server-side record of one connected client (or bot). */
export interface Player {
  id: string;
  nickname: string;
  /** Secret handed to the browser so a refresh reclaims the same seat. */
  token: string;
  socketId: string | null;
  address: string;
  score: number;
  wins: number;
  losses: number;
  connectedAt: number;
  status: PlayerStatus;
  roomId: string | null;
  isBot: boolean;
  /** Pending "you have N seconds to come back" timer. */
  dropTimer: NodeJS.Timeout | null;
}

export const makePlayer = (p: Partial<Player> & Pick<Player, 'id' | 'nickname' | 'token'>): Player => ({
  socketId: null,
  address: 'local',
  score: 0,
  wins: 0,
  losses: 0,
  connectedAt: Date.now(),
  status: 'idle',
  roomId: null,
  isBot: false,
  dropTimer: null,
  ...p,
});
