import type { GameServer } from '../core/GameServer.js';
import { NETWORK } from '@battleship/shared';

/**
 * The server program's own display. The assignment requires the SERVER to show
 * (1) how many clients are online and (2) who they are — this prints exactly
 * that in the terminal, and re-renders whenever anything changes.
 * (There is also a richer web dashboard at /admin with the reset button.)
 */

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  magenta: '\x1b[35m', red: '\x1b[31m', gray: '\x1b[90m',
};

const STATUS_COLOR: Record<string, string> = {
  idle: C.green, queued: C.yellow, playing: C.cyan, spectating: C.magenta, away: C.gray,
};

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));

export function attachConsole(game: GameServer, addresses: string[]) {
  let scheduled = false;

  const render = () => {
    scheduled = false;
    const s = game.adminState();
    const lines: string[] = [];

    lines.push('');
    lines.push(`${C.bold}${C.cyan}  ⚓  BATTLESHIP SERVER${C.reset}`);
    lines.push(`${C.gray}  ${'─'.repeat(74)}${C.reset}`);
    lines.push(`  Listening on ${C.bold}:${NETWORK.PORT}${C.reset}`);
    for (const a of addresses) {
      lines.push(`    ${C.green}http://${a}:${NETWORK.PORT}${C.reset}   ${C.dim}game client${C.reset}`);
    }
    lines.push(`    ${C.yellow}http://localhost:${NETWORK.PORT}/admin${C.reset}   ${C.dim}server dashboard + reset${C.reset}`);
    lines.push('');
    lines.push(`  ${C.bold}CLIENTS ONLINE: ${C.green}${s.onlineCount}${C.reset}   ${C.dim}(registered: ${s.clients.length} · matches played: ${s.matchesPlayed})${C.reset}`);
    lines.push(`${C.gray}  ${'─'.repeat(74)}${C.reset}`);
    lines.push(`  ${C.dim}${pad('NICKNAME', 18)}${pad('ADDRESS', 18)}${pad('STATUS', 12)}${pad('SCORE', 7)}${pad('W/L', 8)}${C.reset}`);

    if (!s.clients.length) {
      lines.push(`  ${C.dim}(no clients connected yet)${C.reset}`);
    }
    for (const c of s.clients) {
      const col = STATUS_COLOR[c.status] ?? '';
      lines.push(
        `  ${pad(c.nickname, 18)}${C.dim}${pad(c.address, 18)}${C.reset}` +
        `${col}${pad(c.status, 12)}${C.reset}${pad(String(c.score), 7)}${C.dim}${pad(`${c.wins}/${c.losses}`, 8)}${C.reset}`
      );
    }

    lines.push('');
    lines.push(`  ${C.bold}ACTIVE MATCHES: ${s.rooms.length}${C.reset}`);
    for (const r of s.rooms) {
      lines.push(
        `    ${C.dim}·${C.reset} ${pad(r.players.join('  vs  '), 34)} ` +
        `${C.cyan}${pad(r.phase, 10)}${C.reset}${C.dim}${r.spectators ? `${r.spectators} watching` : ''}${C.reset}`
      );
    }
    lines.push('');

    console.clear();
    process.stdout.write(lines.join('\n') + '\n');
  };

  game.onConsoleRefresh = () => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(render, 60); // coalesce bursts of updates
  };

  render();
  return render;
}
