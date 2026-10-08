import { fail, ok } from '@battleship/shared';
import type { BotDifficulty, Ship } from '@battleship/shared';
import type { GameServer, IO, Sock } from '../core/GameServer.js';
import type { Player } from '../core/Player.js';

type Result = { ok: true; data?: unknown } | { ok: false; error: string };
type AnyAck = (r: Result) => void;

/**
 * Thin translation layer: socket event in -> GameServer method -> ack out.
 * Deliberately contains no game rules, so all logic stays testable in core/.
 */
export function registerHandlers(io: IO, game: GameServer) {
  io.on('connection', (socket: Sock) => {
    /**
     * Never trust the wire: a missing payload, a missing ack or a wrong field
     * type must come back as an error, not take the whole server down.
     */
    const on = <P = Record<string, never>>(event: string, fn: (payload: P) => Result) => {
      (socket as any).on(event, (...args: unknown[]) => {
        const last = args[args.length - 1];
        const ack: AnyAck = typeof last === 'function' ? (last as AnyAck) : () => {};
        const payload = (args[0] && typeof args[0] === 'object' ? args[0] : {}) as P;
        try {
          ack(fn(payload));
        } catch {
          ack(fail('Bad request.'));
        }
      });
    };

    /** Same, but resolves the player behind this socket first. */
    const onPlayer = <P = Record<string, never>>(event: string, fn: (player: Player, payload: P) => Result) =>
      on<P>(event, (payload) => {
        const player = game.playerBySocket(socket.id);
        return player ? fn(player, payload) : fail('Join with a nickname first.');
      });

    /** Dashboard actions need a socket that passed `admin:watch`. */
    const onAdmin = <P = Record<string, never>>(event: string, fn: (payload: P) => Result) =>
      on<P>(event, (payload) =>
        game.isAdmin(socket.id) ? fn(payload) : fail('Unlock the server dashboard first.'));

    /* --- session ---------------------------------------------------- */
    on<{ nickname: string; token?: string }>('session:join', ({ nickname, token }) => {
      const player = game.joinSession(socket, nickname, typeof token === 'string' ? token : undefined);
      socket.emit('lobby:state', game.lobbyState());
      return ok({
        playerId: player.id,
        nickname: player.nickname,
        token: player.token,
        score: player.score,
      });
    });

    /* --- lobby ------------------------------------------------------ */
    onPlayer<{ targetId: string }>('lobby:challenge', (p, { targetId }) => game.challenge(p, targetId));

    onPlayer<{ fromId: string; accept: boolean }>('lobby:respond', (p, { fromId, accept }) =>
      game.respondToChallenge(p, fromId, accept === true));

    onPlayer<{ join: boolean }>('lobby:queue', (p, { join }) => game.setQueued(p, join === true));

    onPlayer<{ difficulty: BotDifficulty }>('lobby:playBot', (p, { difficulty }) =>
      game.playBot(p, difficulty));

    onPlayer<{ roomId: string }>('lobby:spectate', (p, { roomId }) => game.spectate(p, roomId));

    /* --- room ------------------------------------------------------- */
    onPlayer('room:leave', (p) => game.leaveRoom(p));

    onPlayer<{ ships: Ship[] }>('room:placeFleet', (p, { ships }) => {
      const room = game.roomOf(p.id);
      return room ? room.placeFleet(p.id, ships) : fail('You are not in a match.');
    });

    onPlayer<{ cell: number }>('room:fire', (p, { cell }) => {
      const room = game.roomOf(p.id);
      return room ? room.fire(p.id, cell) : fail('You are not in a match.');
    });

    onPlayer<{ agree: boolean }>('room:rematch', (p, { agree }) => {
      const room = game.roomOf(p.id);
      return room ? room.rematch(p.id, agree === true) : fail('You are not in a match.');
    });

    onPlayer<{ text: string; kind?: 'chat' | 'emote' }>('room:chat', (p, { text, kind }) =>
      game.chat(p, text, kind === 'emote' ? 'emote' : 'chat'));

    onPlayer('room:hint', (p) => {
      const room = game.roomOf(p.id);
      return room ? room.hint(p.id) : fail('You are not in a match.');
    });

    /* --- server dashboard ------------------------------------------- */
    on<{ key: string }>('admin:watch', ({ key }) => game.watchAdmin(socket, key));
    onAdmin('admin:reset', () => game.reset());
    onAdmin<{ playerId: string }>('admin:kick', ({ playerId }) => game.kick(playerId));

    socket.on('disconnect', () => game.handleDisconnect(socket.id));
  });
}
