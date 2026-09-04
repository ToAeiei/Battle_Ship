import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import { Server } from 'socket.io';
import { NETWORK } from '@battleship/shared';
import type { ClientToServerEvents, ServerToClientEvents } from '@battleship/shared';
import { GameServer } from './core/GameServer.js';
import { registerHandlers } from './net/handlers.js';
import { attachConsole } from './admin/console.js';

const here = dirname(fileURLToPath(import.meta.url));
const clientDist = join(here, '../../client/dist');

/** Every LAN address the second computer could use to reach us. */
function localAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out.length ? out : ['localhost'];
}

const app = express();
const http = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(http, {
  cors: { origin: '*' },
  pingInterval: 10_000,
  pingTimeout: 20_000,
});

const addresses = localAddresses();
const game = new GameServer(io, addresses);
registerHandlers(io, game);

// --- serve the built game client -------------------------------------------
app.get('/api/health', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Single-page app: every unknown path renders index.html (so /admin works).
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
} else {
  app.get('*', (_req, res) =>
    res
      .status(503)
      .send('<h1>Client not built</h1><p>Run <code>npm run build</code> first, or use <code>npm run dev</code>.</p>')
  );
}

http.listen(NETWORK.PORT, '0.0.0.0', () => {
  attachConsole(game, addresses);
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { io.close(); http.close(() => process.exit(0)); });
}
