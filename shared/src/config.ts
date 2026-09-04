/**
 * -----------------------------------------------------------------------------
 * SINGLE SOURCE OF TRUTH FOR EVERY TUNABLE NUMBER IN THE GAME.
 * Change a value here and both the server and the client pick it up.
 * -----------------------------------------------------------------------------
 */

/** Network — the client never asks the user for an IP or a port. */
export const NETWORK = {
  /** Port the server listens on (HTTP + Socket.IO share it). */
  PORT: 3000,
  /**
   * Where the client dials.
   * ''  = "same origin the page was served from" (the normal setup: the second
   *       computer just browses to http://<server-ip>:3000 and it works).
   * Set an explicit URL like 'http://192.168.1.10:3000' only if you run the
   * client from a different web server than the game server.
   */
  SERVER_URL: '',
} as const;

/** Board & fleet — assignment: 8x8 grid, 4 ships, each ship 4 connected slots. */
export const BOARD = {
  SIZE: 8,
  SHIP_COUNT: 4,
  SHIP_LENGTH: 4,
  /** false = ships may not touch each other (classic rules). */
  ALLOW_ADJACENT_SHIPS: true,
} as const;

export const CELL_COUNT = BOARD.SIZE * BOARD.SIZE;
/** Hits needed to sink the whole fleet. */
export const TOTAL_SHIP_CELLS = BOARD.SHIP_COUNT * BOARD.SHIP_LENGTH;

/** Timing rules. */
export const TIMING = {
  /** Assignment: 10 seconds per turn. */
  TURN_SECONDS: 10,
  /** What happens when the clock hits zero. */
  ON_TIMEOUT: 'auto-shoot' as 'auto-shoot' | 'pass-turn',
  /** Seconds allowed for ship placement. 0 = no limit (safe for a live demo). */
  PLACEMENT_SECONDS: 0,
  /** A disconnected player keeps their seat & score for this long. */
  RECONNECT_GRACE_SECONDS: 60,
  /** Delay between a bot's turn starting and it firing (feels human). */
  BOT_THINK_MS: [700, 1500] as [number, number],
} as const;

/** Scoring — assignment: winner of a match gets 1 point. */
export const SCORING = { WIN_POINTS: 1 } as const;

/** Extra-feature knobs. */
export const FEATURES = {
  /** AI shot advisor: how many hints a player gets per match. -1 = unlimited. */
  HINTS_PER_MATCH: 3,
  CHAT_ENABLED: true,
  SPECTATORS_ENABLED: true,
  /** Let spectators see both fleets before the match ends? Off = anti-cheat. */
  SPECTATOR_SEES_SHIPS: false,
  /** Leave '' for no password on the server dashboard (easiest for a demo). */
  ADMIN_KEY: '',
} as const;

export type BotDifficulty = 'easy' | 'normal' | 'admiral';
