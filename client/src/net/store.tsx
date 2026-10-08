import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import type {
  BotDifficulty, CellIndex, ChatMessage, Invite, LobbyState, RoomView, Ship,
} from '@battleship/shared';
import { socket } from './socket.js';
import { sfx } from '../lib/sfx.js';
import { syncClock } from '../lib/clock.js';

/**
 * The seat (token + the nickname bound to it) lives in sessionStorage, so two
 * tabs on one computer are two independent players — handy when demoing.
 * localStorage only remembers the last nickname typed, as a convenience.
 */
const TOKEN_KEY = 'bs.token';
const NAME_KEY = 'bs.nickname';       // sessionStorage: this tab's player
const LAST_NAME_KEY = 'bs.lastNickname'; // localStorage: prefill suggestion

export interface Toast { id: number; kind: 'info' | 'success' | 'warn' | 'error'; text: string }
export interface Session { playerId: string; nickname: string; score: number }
export interface Hint { cell: CellIndex; heat: number[] }

interface Store {
  connected: boolean;
  session: Session | null;
  joining: boolean;
  lobby: LobbyState;
  room: RoomView | null;
  chat: ChatMessage[];
  invite: Invite | null;
  toasts: Toast[];
  hint: Hint | null;
  savedNickname: string;

  join: (nickname: string) => void;
  challenge: (targetId: string) => void;
  respond: (fromId: string, accept: boolean) => void;
  setQueued: (join: boolean) => void;
  playBot: (d: BotDifficulty) => void;
  spectate: (roomId: string) => void;
  leaveRoom: () => void;
  placeFleet: (ships: Ship[]) => void;
  fire: (cell: CellIndex) => void;
  rematch: (agree: boolean) => void;
  askHint: () => void;
  clearHint: () => void;
  sendChat: (text: string, kind?: 'chat' | 'emote') => void;
  toast: (kind: Toast['kind'], text: string) => void;
}

const Ctx = createContext<Store | null>(null);
export const useGame = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGame must be used inside <GameProvider>');
  return v;
};

const EMPTY_LOBBY: LobbyState = { online: 0, players: [], rooms: [], serverNow: 0 };

export function GameProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(socket.connected);
  const [session, setSession] = useState<Session | null>(null);
  const [joining, setJoining] = useState(false);
  const [lobby, setLobby] = useState<LobbyState>(EMPTY_LOBBY);
  const [room, setRoom] = useState<RoomView | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [hint, setHint] = useState<Hint | null>(null);
  const savedNickname = useRef(localStorage.getItem(LAST_NAME_KEY) ?? '').current;

  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  /** Every emit funnels through here so errors always surface as a toast. */
  const call = useCallback(
    (event: string, payload?: unknown) =>
      new Promise<void>((resolve) => {
        const ack = (r: { ok: boolean; error?: string }) => {
          if (!r?.ok && r?.error) toast('error', r.error);
          resolve();
        };
        if (payload === undefined) (socket as any).emit(event, ack);
        else (socket as any).emit(event, payload, ack);
      }),
    [toast]
  );

  /* --- wiring --------------------------------------------------------- */
  const prevShot = useRef<string>('');
  const prevTurn = useRef<string | null>(null);
  const prevPhase = useRef<string | null>(null);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      // Silent re-join after a refresh or a dropped connection.
      const token = sessionStorage.getItem(TOKEN_KEY);
      const name = sessionStorage.getItem(NAME_KEY);
      if (token && name) doJoin(name, token);
    };
    const onDisconnect = () => setConnected(false);

    const onLobby = (s: LobbyState) => { syncClock(s.serverNow); setLobby(s); };
    const onInvite = (i: Invite) => { setInvite(i); sfx.invite(); };
    const onInviteResult = ({ fromNickname, accepted }: { fromNickname: string; accepted: boolean }) =>
      toast(accepted ? 'success' : 'warn', accepted ? `${fromNickname} accepted!` : `${fromNickname} declined.`);
    const onRoom = (v: RoomView) => { syncClock(v.serverNow); setRoom(v); };
    const onClosed = ({ reason }: { reason: string }) => {
      setRoom(null); setChat([]); setHint(null);
      prevPhase.current = null; prevShot.current = ''; prevTurn.current = null;
      toast('info', reason);
    };
    const onChat = (m: ChatMessage) => setChat((c) => [...c.slice(-120), m]);
    const onToast = (t: { kind: Toast['kind']; text: string }) => toast(t.kind, t.text);
    const onReset = () => { setRoom(null); setChat([]); setHint(null); };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('lobby:state', onLobby);
    socket.on('lobby:invite', onInvite);
    socket.on('lobby:inviteResult', onInviteResult);
    socket.on('room:state', onRoom);
    socket.on('room:closed', onClosed);
    socket.on('room:chat', onChat);
    socket.on('toast', onToast);
    socket.on('server:reset', onReset);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('lobby:state', onLobby);
      socket.off('lobby:invite', onInvite);
      socket.off('lobby:inviteResult', onInviteResult);
      socket.off('room:state', onRoom);
      socket.off('room:closed', onClosed);
      socket.off('room:chat', onChat);
      socket.off('toast', onToast);
      socket.off('server:reset', onReset);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- audio reactions to state changes -------------------------------- */
  useEffect(() => {
    if (!room || !session) return;

    const shotKey = room.lastShot ? `${room.lastShot.byPlayerId}:${room.lastShot.cell}:${room.phase}` : '';
    if (shotKey && shotKey !== prevShot.current) {
      prevShot.current = shotKey;
      const m = room.lastShot!.mark;
      if (m === 'sunk') sfx.sunk();
      else if (m === 'hit') sfx.hit();
      else sfx.miss();
    }

    if (room.phase === 'playing' && room.turnPlayerId !== prevTurn.current) {
      prevTurn.current = room.turnPlayerId;
      if (room.turnPlayerId === session.playerId) sfx.turn();
      setHint(null);
    }

    if (room.phase !== prevPhase.current) {
      if (room.phase === 'finished') {
        room.winnerId === session.playerId ? sfx.win() : sfx.lose();
      }
      prevPhase.current = room.phase;
    }
  }, [room, session]);

  /* --- actions --------------------------------------------------------- */
  const doJoin = useCallback((nickname: string, token?: string) => {
    setJoining(true);
    socket.emit('session:join', { nickname, token }, (r) => {
      setJoining(false);
      if (!r.ok) { toast('error', r.error); return; }
      sessionStorage.setItem(TOKEN_KEY, r.data.token);
      sessionStorage.setItem(NAME_KEY, r.data.nickname);
      localStorage.setItem(LAST_NAME_KEY, r.data.nickname);
      setSession({ playerId: r.data.playerId, nickname: r.data.nickname, score: r.data.score });
      // Assignment: greet the player by name once they are in.
      if (!token) toast('success', `Welcome, ${r.data.nickname}.`);
    });
  }, [toast]);

  const value = useMemo<Store>(() => ({
    connected, session, joining, lobby, room, chat, invite, toasts, hint, savedNickname,
    join: (nickname) => doJoin(nickname, sessionStorage.getItem(TOKEN_KEY) ?? undefined),
    challenge: (targetId) => void call('lobby:challenge', { targetId }),
    respond: (fromId, accept) => { setInvite(null); void call('lobby:respond', { fromId, accept }); },
    setQueued: (join) => void call('lobby:queue', { join }),
    playBot: (difficulty) => void call('lobby:playBot', { difficulty }),
    spectate: (roomId) => void call('lobby:spectate', { roomId }),
    leaveRoom: () => void call('room:leave'),
    placeFleet: (ships) => void call('room:placeFleet', { ships }),
    fire: (cell) => { sfx.fire(); setHint(null); void call('room:fire', { cell }); },
    rematch: (agree) => void call('room:rematch', { agree }),
    sendChat: (text, kind = 'chat') => void call('room:chat', { text, kind }),
    clearHint: () => setHint(null),
    askHint: () => {
      socket.emit('room:hint', (r) => {
        if (!r.ok) { toast('error', r.error); return; }
        setHint(r.data);
        toast('info', 'Advisor: the highlighted square is the highest-probability target.');
      });
    },
    toast,
  }), [connected, session, joining, lobby, room, chat, invite, toasts, hint, savedNickname, call, doJoin, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
