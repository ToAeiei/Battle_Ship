import { io, type Socket } from 'socket.io-client';
import { NETWORK } from '@battleship/shared';
import type { ClientToServerEvents, ServerToClientEvents } from '@battleship/shared';

/**
 * The client never asks the user for an address.
 * NETWORK.SERVER_URL === ''  ->  connect back to whoever served this page,
 * which is the game server itself. Set it in shared/src/config.ts if you ever
 * host the client somewhere else.
 */
export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const socket: GameSocket = NETWORK.SERVER_URL
  ? io(NETWORK.SERVER_URL, { transports: ['websocket', 'polling'] })
  : io({ transports: ['websocket', 'polling'] });

export const serverLabel = () =>
  NETWORK.SERVER_URL || `${window.location.host} (auto-detected)`;
