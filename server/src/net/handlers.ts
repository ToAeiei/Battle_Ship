import { fail, ok } from '@battleship/shared';
import type { Ship } from '@battleship/shared';
import type { GameServer, IO, Sock } from '../core/GameServer.js';

/**
 * Thin translation layer: socket event in -> GameServer method -> ack out.
 * Deliberately contains no game rules, so all logic stays testable in core/.
 */
export function registerHandlers(io: IO, game: GameServer) {
  io.on('connection', (socket: Sock) => {
    /** Resolve the player behind this socket, or reject the call. */
    const me = () => game.playerBySocket(socket.id);
    const withPlayer = <A extends unknown[]>(
      fn: (player: NonNullable<ReturnType<typeof me>>, ...args: A) => { ok: true } | { ok: false; error: string }
    ) => (...args: [...A, (r: { ok: true } | { ok: false; error: string }) => void]) => {
      const ack = args.pop() as (r: { ok: true } | { ok: false; error: string }) => void;
      const player = me();
      if (!player) return ack?.(fail('Join with a nickname first.'));
      ack?.(fn(player, ...(args as unknown as A)));
    };

    /* --- session ---------------------------------------------------- */
    socket.on('session:join', ({ nickname, token }, ack) => {
      const player = game.joinSession(socket, nickname, token);
      socket.emit('lobby:state', game.lobbyState());
      ack(ok({
        playerId: player.id,
        nickname: player.nickname,
        token: player.token,
        score: player.score,
      }));
    });

    /* --- lobby ------------------------------------------------------ */
    socket.on('lobby:challenge', withPlayer((p, { targetId }: { targetId: string }) =>
      game.challenge(p, targetId)));

    socket.on('lobby:respond', withPlayer((p, { fromId, accept }: { fromId: string; accept: boolean }) =>
      game.respondToChallenge(p, fromId, accept)));

    socket.on('lobby:queue', withPlayer((p, { join }: { join: boolean }) =>
      game.setQueued(p, join)));

    socket.on('lobby:playBot', withPlayer((p, { difficulty }: { difficulty: 'easy' | 'normal' | 'admiral' }) =>
      game.playBot(p, difficulty)));

    socket.on('lobby:spectate', withPlayer((p, { roomId }: { roomId: string }) =>
      game.spectate(p, roomId)));

    /* --- room ------------------------------------------------------- */
    socket.on('room:leave', withPlayer((p) => game.leaveRoom(p)));

    socket.on('room:placeFleet', withPlayer((p, { ships }: { ships: Ship[] }) => {
      const room = game.roomOf(p.id);
      return room ? room.placeFleet(p.id, ships) : fail('You are not in a match.');
    }));

    socket.on('room:fire', withPlayer((p, { cell }: { cell: number }) => {
      const room = game.roomOf(p.id);
      return room ? room.fire(p.id, cell) : fail('You are not in a match.');
    }));

    socket.on('room:rematch', withPlayer((p, { agree }: { agree: boolean }) => {
      const room = game.roomOf(p.id);
      return room ? room.rematch(p.id, agree) : fail('You are not in a match.');
    }));

    socket.on('room:chat', withPlayer((p, { text, kind }: { text: string; kind?: 'chat' | 'emote' }) =>
      game.chat(p, text, kind ?? 'chat')));

    socket.on('room:hint', (ack) => {
      const player = me();
      if (!player) return ack(fail('Join with a nickname first.'));
      const room = game.roomOf(player.id);
      if (!room) return ack(fail('You are not in a match.'));
      ack(room.hint(player.id));
    });

    /* --- server dashboard ------------------------------------------- */
    socket.on('admin:watch', ({ key }, ack) => ack(game.watchAdmin(socket, key)));
    socket.on('admin:reset', (ack) => ack(game.reset()));
    socket.on('admin:kick', ({ playerId }, ack) => ack(game.kick(playerId)));

    socket.on('disconnect', () => game.handleDisconnect(socket.id));
  });
}
