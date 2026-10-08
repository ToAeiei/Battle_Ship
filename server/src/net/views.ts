import { FEATURES, countSunkShips } from '@battleship/shared';
import type { RoomView, SideView } from '@battleship/shared';
import type { Room, Side } from '../core/Room.js';

/**
 * Turns internal room state into exactly what one recipient is allowed to see.
 * This is the anti-cheat boundary: enemy ship positions never leave the server
 * until the match is over.
 */

function toSideView(side: Side, revealShips: boolean): SideView {
  return {
    id: side.player.id,
    nickname: side.player.nickname,
    score: side.player.score,
    isBot: side.player.isBot,
    connected: side.player.isBot || side.player.socketId !== null,
    ready: side.ready,
    ships: revealShips ? side.ships : null,
    marks: side.marks,
    shipsSunk: countSunkShips(side.ships ?? [], side.marks),
    shotsFired: side.shotsFired,
    hits: side.hits,
    wantsRematch: side.wantsRematch,
  };
}

export function buildRoomView(room: Room, viewerId: string): RoomView {
  const finished = room.phase === 'finished';
  const myIndex = room.indexOf(viewerId);
  const isPlayer = myIndex >= 0;

  const reveal = (side: Side) => {
    if (finished) return true;                       // post-match reveal for everyone
    if (isPlayer) return side.player.id === viewerId; // players see only their own fleet
    return FEATURES.SPECTATOR_SEES_SHIPS;             // spectator policy
  };

  const sides = room.sides.map((s) => toSideView(s, reveal(s))) as [SideView, SideView];
  const mine = myIndex === 0 || myIndex === 1 ? myIndex : null;

  return {
    id: room.id,
    phase: room.phase,
    you: mine === null ? null : sides[mine],
    opponent: mine === null ? null : sides[1 - mine],
    sides,
    turnPlayerId: room.turnPlayerId,
    turnEndsAt: room.turnEndsAt,
    winnerId: room.winnerId,
    lastShot: room.lastShot,
    role: isPlayer ? 'player' : 'spectator',
    hintsLeft: room.hintsLeft[viewerId] ?? 0,
    vsBot: room.vsBot,
    botDifficulty: room.botDifficulty,
    spectators: room.spectators.size,
    placementEndsAt: room.placementEndsAt,
    round: room.round,
    moveLog: room.moveLog.slice(-40),
    serverNow: Date.now(),
  };
}
