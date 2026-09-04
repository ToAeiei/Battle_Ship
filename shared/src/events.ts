import type { BotDifficulty } from './config.js';
import type {
  AdminState, CellIndex, ChatMessage, Invite, LobbyState, RoomView, Ship,
} from './types.js';

/**
 * The full socket contract. Both sides import these interfaces, so a typo in an
 * event name or payload is a compile error rather than a silent bug.
 */

export interface SessionInfo {
  playerId: string;
  nickname: string;
  /** Store this in localStorage; sending it back reclaims the same seat. */
  token: string;
  score: number;
}

/** Events the CLIENT sends to the SERVER. */
export interface ClientToServerEvents {
  /* --- session ------------------------------------------------------- */
  'session:join': (
    p: { nickname: string; token?: string },
    ack: (r: Ok<SessionInfo>) => void
  ) => void;

  /* --- lobby --------------------------------------------------------- */
  'lobby:challenge': (p: { targetId: string }, ack: Ack) => void;
  'lobby:respond': (p: { fromId: string; accept: boolean }, ack: Ack) => void;
  'lobby:queue': (p: { join: boolean }, ack: Ack) => void;
  'lobby:playBot': (p: { difficulty: BotDifficulty }, ack: Ack) => void;
  'lobby:spectate': (p: { roomId: string }, ack: Ack) => void;

  /* --- room ---------------------------------------------------------- */
  'room:leave': (ack: Ack) => void;
  'room:placeFleet': (p: { ships: Ship[] }, ack: Ack) => void;
  'room:fire': (p: { cell: CellIndex }, ack: Ack) => void;
  'room:rematch': (p: { agree: boolean }, ack: Ack) => void;
  'room:hint': (ack: (r: Ok<{ cell: CellIndex; heat: number[] }>) => void) => void;
  'room:chat': (p: { text: string; kind?: 'chat' | 'emote' }, ack: Ack) => void;

  /* --- server dashboard ---------------------------------------------- */
  'admin:watch': (p: { key: string }, ack: Ack) => void;
  'admin:reset': (ack: Ack) => void;
  'admin:kick': (p: { playerId: string }, ack: Ack) => void;
}

/** Events the SERVER pushes to CLIENTS. */
export interface ServerToClientEvents {
  'lobby:state': (s: LobbyState) => void;
  'lobby:invite': (i: Invite) => void;
  'lobby:inviteResult': (r: { fromNickname: string; accepted: boolean }) => void;
  'room:state': (v: RoomView) => void;
  'room:closed': (r: { reason: string }) => void;
  'room:chat': (m: ChatMessage) => void;
  'admin:state': (s: AdminState) => void;
  'toast': (t: { kind: 'info' | 'success' | 'warn' | 'error'; text: string }) => void;
  'server:reset': () => void;
}

/* --- ack helpers ------------------------------------------------------ */
export type Ok<T> = { ok: true; data: T } | { ok: false; error: string };
export type Ack = (r: { ok: true } | { ok: false; error: string }) => void;

export const ok = <T,>(data: T) => ({ ok: true as const, data });
export const fail = (error: string) => ({ ok: false as const, error });
