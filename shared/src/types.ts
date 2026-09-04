import type { BotDifficulty } from './config.js';

/** A board cell is addressed by a single index 0..63 (row * SIZE + col). */
export type CellIndex = number;

export type Orientation = 'h' | 'v';

/** One ship as it sits on a board. */
export interface Ship {
  id: string;
  /** Top-left / left-most cell. */
  origin: CellIndex;
  orientation: Orientation;
  /** All slots the ship occupies, in order. */
  cells: CellIndex[];
}

/** What a *shooter* knows about one cell of the enemy board. */
export type ShotMark = 'miss' | 'hit' | 'sunk';

/** What a shot did. */
export interface ShotResult {
  cell: CellIndex;
  mark: ShotMark;
  /** Present when the shot sank a ship: every cell of that ship. */
  sunkShipCells?: CellIndex[];
}

// ---------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------

export type PlayerStatus = 'idle' | 'queued' | 'playing' | 'spectating' | 'away';

/** Public info every client may see about every other connected client. */
export interface LobbyPlayer {
  id: string;
  nickname: string;
  score: number;
  status: PlayerStatus;
  isBot: boolean;
  /** Epoch ms when this client connected. */
  connectedAt: number;
  wins: number;
  losses: number;
}

export interface LobbyRoomSummary {
  id: string;
  players: string[];
  phase: RoomPhase;
  spectators: number;
  vsBot: boolean;
}

export interface LobbyState {
  online: number;
  players: LobbyPlayer[];
  rooms: LobbyRoomSummary[];
}

export interface Invite {
  fromId: string;
  fromNickname: string;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Room / match
// ---------------------------------------------------------------------------

export type RoomPhase = 'placing' | 'playing' | 'finished';

/** One side of a match, as seen by a particular viewer. */
export interface SideView {
  id: string;
  nickname: string;
  score: number;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  /** Ships — only ever filled in for boards the viewer is allowed to see. */
  ships: Ship[] | null;
  /** Shots taken *against* this side: cell -> mark. */
  marks: Record<CellIndex, ShotMark>;
  /** How many of this side's ships are fully sunk. */
  shipsSunk: number;
  shotsFired: number;
  hits: number;
  wantsRematch: boolean;
}

/** The whole room state, already filtered for one recipient. */
export interface RoomView {
  id: string;
  phase: RoomPhase;
  /** 'you' | 'opponent' from the recipient's perspective. */
  you: SideView | null;
  opponent: SideView | null;
  /** Fixed order for spectators/admins: [sideA, sideB]. */
  sides: [SideView, SideView];
  /** Player id whose turn it is (null while placing / finished). */
  turnPlayerId: string | null;
  /** Epoch ms when the current turn expires. */
  turnEndsAt: number | null;
  /** Set when phase === 'finished'. */
  winnerId: string | null;
  /** Last shot, for animations. */
  lastShot: (ShotResult & { byPlayerId: string }) | null;
  /** Whether the recipient is a spectator rather than a player. */
  role: 'player' | 'spectator';
  hintsLeft: number;
  vsBot: boolean;
  botDifficulty: BotDifficulty | null;
  spectators: number;
  /** Seconds allowed for placement, or 0. */
  placementEndsAt: number | null;
  /** Increments on every rematch — the client uses it to reset its draft. */
  round: number;
  moveLog: MoveLogEntry[];
}

export interface MoveLogEntry {
  byPlayerId: string;
  byNickname: string;
  cell: CellIndex;
  mark: ShotMark;
  at: number;
  auto: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  fromId: string;
  fromNickname: string;
  text: string;
  at: number;
  kind: 'chat' | 'system' | 'emote';
}

// ---------------------------------------------------------------------------
// Server dashboard
// ---------------------------------------------------------------------------

export interface AdminClientRow {
  id: string;
  nickname: string;
  socketId: string;
  address: string;
  status: PlayerStatus;
  score: number;
  wins: number;
  losses: number;
  connectedAt: number;
  roomId: string | null;
  isBot: boolean;
}

export interface AdminState {
  onlineCount: number;
  clients: AdminClientRow[];
  rooms: (LobbyRoomSummary & { turnPlayerId: string | null })[];
  serverStartedAt: number;
  matchesPlayed: number;
  host: { port: number; addresses: string[] };
}
