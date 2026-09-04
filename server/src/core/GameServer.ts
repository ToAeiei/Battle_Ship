import type { Server, Socket } from 'socket.io';
import {
  DIFFICULTY_LABELS, FEATURES, NETWORK, TIMING, uid,
} from '@battleship/shared';
import type {
  AdminState, BotDifficulty, ChatMessage, ClientToServerEvents,
  LobbyPlayer, LobbyRoomSummary, LobbyState, ServerToClientEvents,
} from '@battleship/shared';
import { makePlayer, type Player } from './Player.js';
import { Room } from './Room.js';
import { buildRoomView } from '../net/views.js';

export type IO = Server<ClientToServerEvents, ServerToClientEvents>;
export type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

const INVITE_TTL_MS = 30_000;

/**
 * -----------------------------------------------------------------------------
 * The lobby + room registry. Everything stateful about the whole server lives
 * here; `net/handlers.ts` is a thin translation layer from socket events to
 * these methods.
 * -----------------------------------------------------------------------------
 */
export class GameServer {
  readonly startedAt = Date.now();
  matchesPlayed = 0;

  private players = new Map<string, Player>();
  private byToken = new Map<string, string>();
  private bySocket = new Map<string, string>();
  private rooms = new Map<string, Room>();
  private queue: string[] = [];
  private invites = new Map<string, { fromId: string; expiresAt: number }>(); // key: `${from}->${to}`
  private adminSockets = new Set<string>();
  /** Called whenever the console display should be refreshed. */
  onConsoleRefresh: (() => void) | null = null;

  constructor(private io: IO, private localAddresses: string[]) {}

  /* =============================================================== */
  /* sessions                                                        */
  /* =============================================================== */

  joinSession(socket: Sock, nickname: string, token?: string): Player {
    const clean = sanitiseNickname(nickname);
    let player: Player | undefined;

    // Reconnect: same token = same seat, same score, same match.
    if (token) {
      const id = this.byToken.get(token);
      if (id) player = this.players.get(id);
    }

    if (player) {
      if (player.dropTimer) { clearTimeout(player.dropTimer); player.dropTimer = null; }
      player.nickname = clean || player.nickname;
      player.socketId = socket.id;
      player.address = addressOf(socket);
      if (player.status === 'away') player.status = player.roomId ? 'playing' : 'idle';
    } else {
      player = makePlayer({
        id: uid('p-'),
        nickname: clean,
        token: token || uid('t-'),
        socketId: socket.id,
        address: addressOf(socket),
      });
      this.players.set(player.id, player);
    }

    this.byToken.set(player.token, player.id);
    this.bySocket.set(socket.id, player.id);

    const room = this.roomOf(player.id);
    if (room) this.pushRoom(room);
    this.pushLobby();
    this.pushAdmin();
    return player;
  }

  playerBySocket(socketId: string): Player | null {
    const id = this.bySocket.get(socketId);
    return id ? this.players.get(id) ?? null : null;
  }

  handleDisconnect(socketId: string) {
    this.adminSockets.delete(socketId);
    const player = this.playerBySocket(socketId);
    this.bySocket.delete(socketId);
    if (!player) return;

    player.socketId = null;
    player.status = 'away';
    this.removeFromQueue(player.id);

    const room = this.roomOf(player.id);
    if (room) {
      this.system(room, `${player.nickname} lost connection — ${TIMING.RECONNECT_GRACE_SECONDS}s to reconnect.`);
      this.pushRoom(room);
    }

    // Give them a grace period to come back before tearing everything down.
    player.dropTimer = setTimeout(() => {
      const current = this.players.get(player.id);
      if (!current || current.socketId) return;
      const r = this.roomOf(current.id);
      if (r) this.closeRoom(r, `${current.nickname} left the match.`);
      this.players.delete(current.id);
      this.byToken.delete(current.token);
      this.pushLobby();
      this.pushAdmin();
    }, TIMING.RECONNECT_GRACE_SECONDS * 1000);

    this.pushLobby();
    this.pushAdmin();
  }

  /* =============================================================== */
  /* lobby actions                                                   */
  /* =============================================================== */

  challenge(from: Player, targetId: string) {
    const target = this.players.get(targetId);
    if (!target) return err('That player just went offline.');
    if (target.id === from.id) return err('You cannot challenge yourself.');
    if (from.roomId) return err('Leave your current match first.');
    if (target.roomId) return err(`${target.nickname} is already in a match.`);

    this.invites.set(`${from.id}->${target.id}`, { fromId: from.id, expiresAt: Date.now() + INVITE_TTL_MS });
    this.send(target, 'lobby:invite', {
      fromId: from.id,
      fromNickname: from.nickname,
      expiresAt: Date.now() + INVITE_TTL_MS,
    });
    return okv();
  }

  respondToChallenge(me: Player, fromId: string, accept: boolean) {
    const key = `${fromId}->${me.id}`;
    const invite = this.invites.get(key);
    this.invites.delete(key);
    const from = this.players.get(fromId);
    if (!invite || !from) return err('That invitation expired.');
    if (invite.expiresAt < Date.now()) return err('That invitation expired.');

    this.send(from, 'lobby:inviteResult', { fromNickname: me.nickname, accepted: accept });
    if (!accept) return okv();
    if (from.roomId || me.roomId) return err('One of you is already in a match.');

    this.createRoom(from, me);
    return okv();
  }

  setQueued(player: Player, join: boolean) {
    if (join && player.roomId) return err('Leave your current match first.');
    this.removeFromQueue(player.id);
    if (!join) {
      player.status = player.roomId ? 'playing' : 'idle';
      this.pushLobby();
      return okv();
    }
    player.status = 'queued';
    this.queue.push(player.id);
    this.drainQueue();
    this.pushLobby();
    return okv();
  }

  private drainQueue() {
    while (this.queue.length >= 2) {
      const a = this.players.get(this.queue.shift()!);
      const b = this.players.get(this.queue.shift()!);
      if (!a || a.roomId || !a.socketId) { if (b) this.queue.unshift(b.id); continue; }
      if (!b || b.roomId || !b.socketId) { this.queue.unshift(a.id); break; }
      this.createRoom(a, b);
    }
  }

  private removeFromQueue(id: string) {
    this.queue = this.queue.filter((q) => q !== id);
  }

  playBot(player: Player, difficulty: BotDifficulty) {
    if (player.roomId) return err('Leave your current match first.');
    const label = DIFFICULTY_LABELS[difficulty]?.name ?? 'Bot';
    const bot = makePlayer({
      id: uid('bot-'),
      nickname: `${label} (AI)`,
      token: uid('bt-'),
      isBot: true,
      address: 'internal',
    });
    this.players.set(bot.id, bot);
    this.createRoom(player, bot, { botDifficulty: difficulty });
    return okv();
  }

  spectate(player: Player, roomId: string) {
    if (!FEATURES.SPECTATORS_ENABLED) return err('Spectating is disabled.');
    if (player.roomId) return err('Leave your current match first.');
    const room = this.rooms.get(roomId);
    if (!room) return err('That match is over.');
    if (room.has(player.id)) return err('You are playing in that match.');

    room.addSpectator(player.id);
    player.roomId = room.id;
    player.status = 'spectating';
    this.pushRoom(room);
    this.pushLobby();
    this.pushAdmin();
    return okv();
  }

  /* =============================================================== */
  /* rooms                                                           */
  /* =============================================================== */

  private createRoom(a: Player, b: Player, opts: { botDifficulty?: BotDifficulty } = {}) {
    this.removeFromQueue(a.id);
    this.removeFromQueue(b.id);

    const room = new Room(a, b, {
      onUpdate: (r) => this.pushRoom(r),
      onMatchEnd: (r) => {
        this.matchesPlayed += 1;
        this.pushLobby();
        this.pushAdmin();
      },
      onSystem: (r, text) => this.system(r, text),
    }, opts);

    this.rooms.set(room.id, room);
    a.roomId = room.id; b.roomId = room.id;
    a.status = 'playing'; b.status = 'playing';

    this.system(room, `Match created. ${a.nickname} vs ${b.nickname}. Deploy your fleets!`);
    this.pushRoom(room);
    this.pushLobby();
    this.pushAdmin();
    return room;
  }

  roomOf(playerId: string): Room | null {
    const p = this.players.get(playerId);
    if (!p?.roomId) return null;
    return this.rooms.get(p.roomId) ?? null;
  }

  leaveRoom(player: Player) {
    const room = this.roomOf(player.id);
    if (!room) return okv();

    if (room.has(player.id)) {
      this.closeRoom(room, `${player.nickname} left the match.`);
    } else {
      room.removeSpectator(player.id);
      player.roomId = null;
      player.status = 'idle';
      this.send(player, 'room:closed', { reason: 'You stopped spectating.' });
      this.pushRoom(room);
    }
    this.pushLobby();
    this.pushAdmin();
    return okv();
  }

  private closeRoom(room: Room, reason: string) {
    for (const p of room.players) {
      if (p.socketId) this.send(p, 'room:closed', { reason });
    }
    for (const sid of room.spectators) {
      const s = this.players.get(sid);
      if (s) { s.roomId = null; s.status = 'idle'; this.send(s, 'room:closed', { reason }); }
    }
    room.dispose();
    // Bots exist only for their match.
    for (const p of room.players) if (p.isBot) this.players.delete(p.id);
    this.rooms.delete(room.id);
    this.pushLobby();
    this.pushAdmin();
  }

  chat(player: Player, text: string, kind: 'chat' | 'emote' = 'chat') {
    if (!FEATURES.CHAT_ENABLED) return err('Chat is disabled.');
    const room = this.roomOf(player.id);
    if (!room) return err('You are not in a match.');
    const clean = text.slice(0, 200).trim();
    if (!clean) return err('Say something first.');
    this.emitChat(room, {
      id: uid('m-'),
      roomId: room.id,
      fromId: player.id,
      fromNickname: player.nickname,
      text: clean,
      at: Date.now(),
      kind,
    });
    return okv();
  }

  private system(room: Room, text: string) {
    this.emitChat(room, {
      id: uid('m-'),
      roomId: room.id,
      fromId: 'system',
      fromNickname: 'Control',
      text,
      at: Date.now(),
      kind: 'system',
    });
  }

  private emitChat(room: Room, message: ChatMessage) {
    for (const p of this.roomAudience(room)) this.send(p, 'room:chat', message);
  }

  private roomAudience(room: Room): Player[] {
    const out = room.players.filter((p) => !p.isBot);
    for (const sid of room.spectators) {
      const s = this.players.get(sid);
      if (s) out.push(s);
    }
    return out;
  }

  /* =============================================================== */
  /* admin                                                           */
  /* =============================================================== */

  watchAdmin(socket: Sock, key: string) {
    if (FEATURES.ADMIN_KEY && key !== FEATURES.ADMIN_KEY) return err('Wrong dashboard key.');
    this.adminSockets.add(socket.id);
    socket.emit('admin:state', this.adminState());
    return okv();
  }

  /** The assignment's server RESET button: wipe every match and every score. */
  reset() {
    for (const room of [...this.rooms.values()]) {
      this.closeRoom(room, 'The server reset the game.');
    }
    this.queue = [];
    this.invites.clear();
    this.matchesPlayed = 0;
    for (const p of this.players.values()) {
      // Bots and clients that are already gone do not survive a reset.
      if (p.isBot || !p.socketId) {
        if (p.dropTimer) clearTimeout(p.dropTimer);
        this.players.delete(p.id);
        this.byToken.delete(p.token);
        continue;
      }
      p.score = 0; p.wins = 0; p.losses = 0;
      p.roomId = null;
      p.status = 'idle';
    }
    this.io.emit('server:reset');
    this.io.emit('toast', { kind: 'warn', text: 'The server reset all games and scores.' });
    this.pushLobby();
    this.pushAdmin();
    return okv();
  }

  kick(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return err('No such client.');
    const room = this.roomOf(p.id);
    if (room) this.closeRoom(room, `${p.nickname} was removed by the server.`);
    if (p.socketId) {
      this.send(p, 'toast', { kind: 'error', text: 'You were disconnected by the server.' });
      this.io.sockets.sockets.get(p.socketId)?.disconnect(true);
    }
    this.players.delete(p.id);
    this.byToken.delete(p.token);
    this.pushLobby();
    this.pushAdmin();
    return okv();
  }

  /* =============================================================== */
  /* broadcasting                                                    */
  /* =============================================================== */

  private send<E extends keyof ServerToClientEvents>(
    player: Player,
    event: E,
    ...args: Parameters<ServerToClientEvents[E]>
  ) {
    if (!player.socketId) return;
    this.io.to(player.socketId).emit(event, ...args);
  }

  pushRoom(room: Room) {
    for (const p of this.roomAudience(room)) {
      this.send(p, 'room:state', buildRoomView(room, p.id));
    }
    this.pushAdmin();
  }

  pushLobby() {
    const state = this.lobbyState();
    for (const p of this.players.values()) if (!p.isBot) this.send(p, 'lobby:state', state);
    this.onConsoleRefresh?.();
  }

  lobbyState(): LobbyState {
    const players: LobbyPlayer[] = [...this.players.values()]
      .filter((p) => !p.isBot)
      .sort((a, b) => b.score - a.score || a.connectedAt - b.connectedAt)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        status: p.status,
        isBot: p.isBot,
        connectedAt: p.connectedAt,
        wins: p.wins,
        losses: p.losses,
      }));

    return { online: players.filter((p) => p.status !== 'away').length, players, rooms: this.roomSummaries() };
  }

  private roomSummaries(): LobbyRoomSummary[] {
    return [...this.rooms.values()].map((r) => ({
      id: r.id,
      players: r.players.map((p) => p.nickname),
      phase: r.phase,
      spectators: r.spectators.size,
      vsBot: r.vsBot,
    }));
  }

  pushAdmin() {
    if (!this.adminSockets.size) { this.onConsoleRefresh?.(); return; }
    const state = this.adminState();
    for (const sid of this.adminSockets) this.io.to(sid).emit('admin:state', state);
    this.onConsoleRefresh?.();
  }

  adminState(): AdminState {
    const clients = [...this.players.values()]
      .filter((p) => !p.isBot)
      .sort((a, b) => a.connectedAt - b.connectedAt)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        socketId: p.socketId ?? '—',
        address: p.address,
        status: p.status,
        score: p.score,
        wins: p.wins,
        losses: p.losses,
        connectedAt: p.connectedAt,
        roomId: p.roomId,
        isBot: p.isBot,
      }));

    return {
      onlineCount: clients.filter((c) => c.status !== 'away').length,
      clients,
      rooms: [...this.rooms.values()].map((r) => ({
        id: r.id,
        players: r.players.map((p) => p.nickname),
        phase: r.phase,
        spectators: r.spectators.size,
        vsBot: r.vsBot,
        turnPlayerId: r.turnPlayerId,
      })),
      serverStartedAt: this.startedAt,
      matchesPlayed: this.matchesPlayed,
      host: { port: NETWORK.PORT, addresses: this.localAddresses },
    };
  }
}

/* --- helpers ---------------------------------------------------------- */

const err = (error: string) => ({ ok: false as const, error });
const okv = () => ({ ok: true as const });

const addressOf = (socket: Sock) => {
  const fwd = socket.handshake.headers['x-forwarded-for'];
  const raw = (Array.isArray(fwd) ? fwd[0] : fwd) || socket.handshake.address || '';
  return raw.replace('::ffff:', '') || 'unknown';
};

export const sanitiseNickname = (raw: string) => {
  const clean = (raw ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 16);
  return clean || `Sailor${Math.floor(Math.random() * 900 + 100)}`;
};
