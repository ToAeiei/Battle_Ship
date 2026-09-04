import {
  BOARD, FEATURES, SCORING, TIMING,
  allCells, botShot, cellLabel, generateFleet, isFleetDestroyed, countSunkShips,
  normaliseFleet, pick, randInt, resolveShot, suggestShot, uid, validateFleet,
} from '@battleship/shared';
import type {
  BotDifficulty, CellIndex, MoveLogEntry, Ship, ShotMark, ShotResult,
} from '@battleship/shared';
import type { Player } from './Player.js';

/** One player's half of the board state. `marks` = shots RECEIVED here. */
export interface Side {
  player: Player;
  ships: Ship[] | null;
  marks: Record<CellIndex, ShotMark>;
  ready: boolean;
  shotsFired: number;
  hits: number;
  wantsRematch: boolean;
}

export interface RoomHooks {
  /** Any state change worth pushing to clients. */
  onUpdate: (room: Room) => void;
  /** A match just ended (scores already applied). */
  onMatchEnd: (room: Room, winner: Player, loser: Player) => void;
  /** Chat-channel system line, e.g. "Alice sank a ship!". */
  onSystem: (room: Room, text: string) => void;
}

/**
 * -----------------------------------------------------------------------------
 * A single match between two seats. Server-authoritative: the client may ask,
 * but every rule (legal placement, whose turn, what a shot did, who won) is
 * decided here.
 * -----------------------------------------------------------------------------
 * Lifecycle:  placing -> playing -> finished -> (rematch) -> placing ...
 */
export class Room {
  readonly id = uid('room-');
  readonly createdAt = Date.now();
  sides: [Side, Side];
  phase: 'placing' | 'playing' | 'finished' = 'placing';
  round = 0;
  turnIndex: 0 | 1 = 0;
  turnEndsAt: number | null = null;
  placementEndsAt: number | null = null;
  winnerId: string | null = null;
  lastShot: (ShotResult & { byPlayerId: string }) | null = null;
  moveLog: MoveLogEntry[] = [];
  spectators = new Set<string>();
  hintsLeft: Record<string, number> = {};
  readonly vsBot: boolean;
  readonly botDifficulty: BotDifficulty | null;

  private turnTimer: NodeJS.Timeout | null = null;
  private botTimer: NodeJS.Timeout | null = null;
  private placeTimer: NodeJS.Timeout | null = null;

  constructor(
    a: Player,
    b: Player,
    private hooks: RoomHooks,
    opts: { botDifficulty?: BotDifficulty } = {}
  ) {
    this.sides = [makeSide(a), makeSide(b)];
    this.vsBot = a.isBot || b.isBot;
    this.botDifficulty = opts.botDifficulty ?? (this.vsBot ? 'normal' : null);
    // Assignment: the SERVER randomly picks who starts the first match.
    this.turnIndex = Math.random() < 0.5 ? 0 : 1;
    this.beginPlacement();
  }

  /* --------------------------------------------------------------- */
  /* lookups                                                          */
  /* --------------------------------------------------------------- */

  get players(): Player[] { return this.sides.map((s) => s.player); }
  get turnPlayerId(): string | null {
    return this.phase === 'playing' ? this.sides[this.turnIndex].player.id : null;
  }
  sideOf(playerId: string): Side | null {
    return this.sides.find((s) => s.player.id === playerId) ?? null;
  }
  opponentOf(playerId: string): Side | null {
    return this.sides.find((s) => s.player.id !== playerId) ?? null;
  }
  indexOf(playerId: string): 0 | 1 | -1 {
    const i = this.sides.findIndex((s) => s.player.id === playerId);
    return i as 0 | 1 | -1;
  }
  has(playerId: string) { return this.indexOf(playerId) >= 0; }

  /* --------------------------------------------------------------- */
  /* placement phase                                                  */
  /* --------------------------------------------------------------- */

  private beginPlacement() {
    this.phase = 'placing';
    this.round += 1;
    this.winnerId = null;
    this.lastShot = null;
    this.moveLog = [];
    this.turnEndsAt = null;
    for (const s of this.sides) {
      s.ships = null;
      s.marks = {};
      s.ready = false;
      s.shotsFired = 0;
      s.hits = 0;
      s.wantsRematch = false;
      this.hintsLeft[s.player.id] = FEATURES.HINTS_PER_MATCH;
      s.player.status = 'playing';
      // Bots place themselves instantly.
      if (s.player.isBot) {
        s.ships = generateFleet('spread');
        s.ready = true;
      }
    }

    if (TIMING.PLACEMENT_SECONDS > 0) {
      this.placementEndsAt = Date.now() + TIMING.PLACEMENT_SECONDS * 1000;
      this.clear('place');
      this.placeTimer = setTimeout(() => this.autoPlaceStragglers(), TIMING.PLACEMENT_SECONDS * 1000);
    } else {
      this.placementEndsAt = null;
    }
  }

  private autoPlaceStragglers() {
    for (const s of this.sides) {
      if (!s.ready) {
        s.ships = generateFleet('random');
        s.ready = true;
        this.hooks.onSystem(this, `${s.player.nickname}'s fleet was auto-deployed (time up).`);
      }
    }
    this.maybeStart();
  }

  placeFleet(playerId: string, ships: Ship[]): { ok: true } | { ok: false; error: string } {
    if (this.phase !== 'placing') return { ok: false, error: 'Ships are already locked in.' };
    const side = this.sideOf(playerId);
    if (!side) return { ok: false, error: 'You are not in this match.' };

    const normalised = normaliseFleet(ships);
    const check = validateFleet(normalised);
    if (!check.ok) return { ok: false, error: check.error ?? 'Invalid fleet.' };

    side.ships = normalised;
    side.ready = true;
    this.hooks.onSystem(this, `${side.player.nickname} is ready.`);
    this.maybeStart();
    return { ok: true };
  }

  private maybeStart() {
    if (!this.sides.every((s) => s.ready && s.ships)) {
      this.hooks.onUpdate(this);
      return;
    }
    this.clear('place');
    this.placementEndsAt = null;
    this.phase = 'playing';
    this.hooks.onSystem(
      this,
      `Battle stations — ${this.sides[this.turnIndex].player.nickname} fires first.`
    );
    this.startTurn();
  }

  /* --------------------------------------------------------------- */
  /* battle phase                                                     */
  /* --------------------------------------------------------------- */

  private startTurn() {
    this.turnEndsAt = Date.now() + TIMING.TURN_SECONDS * 1000;
    this.clear('turn');
    this.turnTimer = setTimeout(() => this.onTurnTimeout(), TIMING.TURN_SECONDS * 1000);
    this.hooks.onUpdate(this);
    this.maybeScheduleBot();
  }

  private onTurnTimeout() {
    if (this.phase !== 'playing') return;
    const side = this.sides[this.turnIndex];

    if (TIMING.ON_TIMEOUT === 'auto-shoot') {
      const enemy = this.sides[1 - this.turnIndex];
      const open = allCells().filter((c) => enemy.marks[c] === undefined);
      if (open.length) {
        this.hooks.onSystem(this, `${side.player.nickname} ran out of time — auto-fire!`);
        this.applyShot(side.player.id, pick(open), true);
        return;
      }
    }
    this.hooks.onSystem(this, `${side.player.nickname} ran out of time and lost the turn.`);
    this.nextTurn();
  }

  private maybeScheduleBot() {
    const current = this.sides[this.turnIndex].player;
    if (!current.isBot || this.phase !== 'playing') return;
    this.clear('bot');
    const delay = randInt(TIMING.BOT_THINK_MS[0], TIMING.BOT_THINK_MS[1]);
    this.botTimer = setTimeout(() => {
      if (this.phase !== 'playing') return;
      const enemy = this.sides[1 - this.turnIndex];
      const shot = botShot(
        { marks: enemy.marks, shipsSunk: countSunkShips(enemy.ships ?? [], enemy.marks) },
        this.botDifficulty ?? 'normal'
      );
      this.applyShot(current.id, shot.cell, false);
    }, delay);
  }

  fire(playerId: string, cell: CellIndex): { ok: true } | { ok: false; error: string } {
    if (this.phase !== 'playing') return { ok: false, error: 'The match is not running.' };
    if (this.turnPlayerId !== playerId) return { ok: false, error: "It is not your turn." };
    if (!Number.isInteger(cell) || cell < 0 || cell >= BOARD.SIZE * BOARD.SIZE)
      return { ok: false, error: 'That square is off the grid.' };
    const enemy = this.opponentOf(playerId)!;
    if (enemy.marks[cell] !== undefined) return { ok: false, error: 'You already fired there.' };

    this.applyShot(playerId, cell, false);
    return { ok: true };
  }

  /** The one place a shot is ever resolved. */
  private applyShot(playerId: string, cell: CellIndex, auto: boolean) {
    const shooter = this.sideOf(playerId)!;
    const enemy = this.opponentOf(playerId)!;
    if (enemy.marks[cell] !== undefined) return;

    const result = resolveShot(enemy.ships ?? [], enemy.marks, cell);

    if (result.mark === 'sunk') {
      for (const c of result.sunkShipCells!) enemy.marks[c] = 'sunk';
    } else {
      enemy.marks[cell] = result.mark;
    }

    shooter.shotsFired += 1;
    if (result.mark !== 'miss') shooter.hits += 1;

    this.lastShot = { ...result, byPlayerId: playerId };
    this.moveLog.push({
      byPlayerId: playerId,
      byNickname: shooter.player.nickname,
      cell,
      mark: result.mark,
      at: Date.now(),
      auto,
    });
    if (this.moveLog.length > 200) this.moveLog.shift();

    if (result.mark === 'sunk') {
      this.hooks.onSystem(
        this,
        `${shooter.player.nickname} SANK a ship at ${cellLabel(cell)}!`
      );
    }

    if (isFleetDestroyed(enemy.ships ?? [], enemy.marks)) {
      this.endMatch(shooter, enemy);
      return;
    }

    this.nextTurn();
  }

  private nextTurn() {
    this.turnIndex = (1 - this.turnIndex) as 0 | 1;
    this.startTurn();
  }

  private endMatch(winner: Side, loser: Side) {
    this.clearAll();
    this.phase = 'finished';
    this.turnEndsAt = null;
    this.winnerId = winner.player.id;

    winner.player.score += SCORING.WIN_POINTS;
    winner.player.wins += 1;
    loser.player.losses += 1;

    this.hooks.onSystem(this, `${winner.player.nickname} wins the match!`);
    this.hooks.onMatchEnd(this, winner.player, loser.player);
    this.hooks.onUpdate(this);
  }

  /* --------------------------------------------------------------- */
  /* rematch                                                          */
  /* --------------------------------------------------------------- */

  rematch(playerId: string, agree: boolean): { ok: true } | { ok: false; error: string } {
    if (this.phase !== 'finished') return { ok: false, error: 'The match is still running.' };
    const side = this.sideOf(playerId);
    if (!side) return { ok: false, error: 'You are not in this match.' };
    side.wantsRematch = agree;

    // A bot always says yes.
    const bot = this.sides.find((s) => s.player.isBot);
    if (bot) bot.wantsRematch = true;

    if (!agree) {
      this.hooks.onSystem(this, `${side.player.nickname} declined the rematch.`);
      this.hooks.onUpdate(this);
      return { ok: true };
    }

    if (this.sides.every((s) => s.wantsRematch)) {
      // Assignment: the winner of the previous match starts the next one.
      const winnerIdx = this.indexOf(this.winnerId ?? '');
      const winnerSide = winnerIdx === 0 || winnerIdx === 1 ? this.sides[winnerIdx] : null;
      const previousWinner = winnerSide?.player.nickname ?? null;
      if (winnerIdx === 0 || winnerIdx === 1) this.turnIndex = winnerIdx;
      this.beginPlacement();
      this.hooks.onSystem(
        this,
        previousWinner
          ? `Rematch! ${previousWinner} won last time, so they fire first.`
          : 'Rematch! Place your fleet.'
      );
    } else {
      this.hooks.onSystem(this, `${side.player.nickname} wants a rematch.`);
    }
    this.hooks.onUpdate(this);
    return { ok: true };
  }

  /* --------------------------------------------------------------- */
  /* AI advisor                                                       */
  /* --------------------------------------------------------------- */

  hint(playerId: string):
    | { ok: true; data: { cell: CellIndex; heat: number[] } }
    | { ok: false; error: string } {
    if (this.phase !== 'playing') return { ok: false, error: 'Hints only work during a battle.' };
    if (this.turnPlayerId !== playerId) return { ok: false, error: 'Wait for your turn.' };
    const left = this.hintsLeft[playerId] ?? 0;
    if (FEATURES.HINTS_PER_MATCH >= 0 && left <= 0)
      return { ok: false, error: 'No advisor calls left this match.' };

    const enemy = this.opponentOf(playerId)!;
    const s = suggestShot({
      marks: enemy.marks,
      shipsSunk: countSunkShips(enemy.ships ?? [], enemy.marks),
    });
    if (FEATURES.HINTS_PER_MATCH >= 0) this.hintsLeft[playerId] = left - 1;
    this.hooks.onUpdate(this);
    return { ok: true, data: { cell: s.cell, heat: s.heat } };
  }

  /* --------------------------------------------------------------- */
  /* housekeeping                                                     */
  /* --------------------------------------------------------------- */

  addSpectator(playerId: string) { this.spectators.add(playerId); this.hooks.onUpdate(this); }
  removeSpectator(playerId: string) { this.spectators.delete(playerId); this.hooks.onUpdate(this); }

  private clear(which: 'turn' | 'bot' | 'place') {
    const map = { turn: 'turnTimer', bot: 'botTimer', place: 'placeTimer' } as const;
    const key = map[which];
    if (this[key]) { clearTimeout(this[key]!); this[key] = null; }
  }

  clearAll() { this.clear('turn'); this.clear('bot'); this.clear('place'); }

  dispose() {
    this.clearAll();
    for (const s of this.sides) {
      s.player.roomId = null;
      if (!s.player.isBot) s.player.status = 'idle';
    }
  }
}

const makeSide = (player: Player): Side => ({
  player,
  ships: null,
  marks: {},
  ready: false,
  shotsFired: 0,
  hits: 0,
  wantsRematch: false,
});
