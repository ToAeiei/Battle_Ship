# ⚓ Battleship — online, socket-based, 2+ players

An 8×8 Battleship game built on **socket programming (Socket.IO / WebSocket)** with a
client–server model. One computer runs the **server + a game client**, any other computer
on the same network runs **only the game client** — no IP or port typing required.

```
   Computer A                                  Computer B
┌───────────────────────┐                  ┌──────────────────┐
│  Server  :3000        │◄── WebSocket ───►│   Game client    │
│  + Game client        │                  │  (browser)       │
│  + Dashboard /admin   │                  └──────────────────┘
└───────────────────────┘
```

---

## 1. Run it (2 minutes)

**On the server computer** (needs [Node.js 18+](https://nodejs.org)):

```bash
npm install
npm run play
```

The terminal prints something like:

```
  Listening on :3000
    http://192.168.1.10:3000        game client
    http://localhost:3000/admin     server dashboard + reset
```

| Open this | Where | What it is |
|---|---|---|
| `http://localhost:3000` | server computer | Player 1's game client |
| `http://192.168.1.10:3000` | **any other computer/phone** | Player 2's game client |
| `http://localhost:3000/admin` | server computer | Server dashboard: online count, client list, **Reset** |

> Use the **exact address the terminal prints** on the second computer — both machines
> must be on the same Wi-Fi/LAN. Nothing to install on computer B; it just opens a page.

Stop with `Ctrl+C`. To develop with hot reload instead: `npm run dev`
(client on `:5173`, server on `:3000`, sockets proxied automatically).

### Run it in the cloud

The same code runs on a cloud host, so players anywhere open one public URL.
[`render.yaml`](render.yaml) is a ready-made blueprint for [Render](https://render.com):

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo. It reads `render.yaml`.
3. When asked, set **`ADMIN_KEY`** to a password of your choice — it protects `/admin`.
4. Open the URL Render gives you (`https://<name>.onrender.com`); the dashboard is at `/admin`.

Any Node host works with the same settings:

| Setting | Value |
|---|---|
| Build command | `npm install --include=dev && npm run build` |
| Start command | `npm run start` |
| Health check | `/api/health` |
| Environment | `ADMIN_KEY` = dashboard password · `PORT` is read automatically |
| Instances | exactly **1** (all game state is in memory) |

> Free tiers usually sleep when idle — open the URL a few minutes before a demo.
>
> **Demo note.** The assignment asks for one computer running *the server program and a
> client*, and another running *only a client*. A cloud-only demo does not show that, so
> keep `npm run play` ready on a laptop as well (it is unchanged), or ask which setup is
> expected.

---

## 2. How to play

1. **Type a nickname** → you land in the lobby and see every other connected client.
2. Start a match: **Challenge** a player, use **Quick match**, or **play the AI**.
3. **Deploy 4 ships** (4 slots each): click a hull in the tray, hover the grid, click to drop.
   `R` or right-click rotates · click a placed ship to move it · `🎲 Randomise` fills the board.
4. Press **Ready**. The match starts once both fleets are locked in; the **server** picks who
   shoots first.
5. **Fire** by clicking a square on *Enemy waters*. You get **10 seconds** a turn — if the
   clock runs out the server fires for you.
6. Sink all 4 enemy ships → **Win**, **+1 point**. Then **Rematch** (both must agree — the
   winner of the last match fires first).

---

## 3. Where everything lives

```
shared/src/     ← rules both sides trust (no server or browser code in here)
  config.ts       ⭐ every tunable number: port, grid size, ships, 10s timer, hints…
  board.ts        placement validation, hit/miss/sunk resolution
  ai.ts           probability-density targeting (bot + advisor)
  events.ts       the typed socket contract (event names + payloads)

server/src/
  index.ts        HTTP + Socket.IO bootstrap, serves the built client
  core/Room.ts    ⭐ one match: placing → playing → finished → rematch
  core/GameServer.ts  lobby, matchmaking, scores, reset
  net/views.ts    hides enemy ships before the match ends (anti-cheat boundary)
  admin/console.ts    the live client list printed in the server terminal

client/src/
  screens/        Join → Lobby → Placement → Battle, plus the /admin dashboard
  components/     Board, TurnTimer, Chat, FleetPips, ResultOverlay…
  net/store.tsx   one React context holds all server state
  styles/tokens.css   ⭐ every colour, radius and font — restyle the game from here
```

### Common tweaks

| I want to… | Change |
|---|---|
| Use a different port | `NETWORK.PORT` in `shared/src/config.ts`, or the `PORT` environment variable |
| Give players 15s a turn | `TIMING.TURN_SECONDS` |
| Lose the turn instead of auto-firing on timeout | `TIMING.ON_TIMEOUT: 'pass-turn'` |
| Use a 10×10 grid, or 5 ships of length 3 | `BOARD.SIZE`, `SHIP_COUNT`, `SHIP_LENGTH` |
| Forbid ships touching each other | `BOARD.ALLOW_ADJACENT_SHIPS: false` |
| Change hint count / disable chat | `FEATURES` |
| Password-protect the dashboard | Start the server with the `ADMIN_KEY` environment variable set (PowerShell: `$env:ADMIN_KEY='yourkey'; npm run play`). Unset = open. |
| Recolour everything | `client/src/styles/tokens.css` |

Run `npm run typecheck` after edits — the shared types catch most mistakes instantly.

---

## 4. Assignment checklist

**Fundamental implementation**

| Requirement | Where it is |
|---|---|
| Server + client over socket programming | Socket.IO over WebSocket, `server/src/index.ts` |
| Client connects without typing IP/port | Client is served by the server and dials its own origin (`net/socket.ts`) |
| Client connects first, then learns about other clients | Lobby "Commanders online" list, pushed on every change |
| Nickname + welcome message | Join screen → `Welcome, <name>` in the lobby header and chat |
| Name + score on the game client | Top bar and both scoreboard cards |
| 8×8 grid, 4 ships, all placeable | Placement screen; validated again on the server |
| 10-second countdown per turn | Ring timer; the **server** owns the deadline |
| Hit / miss marking | Red burst / grey splash / orange ✕ for sunk |
| Score + end-of-match status | "WIN"/"LOST" card with both scores |
| Rematch | Both must agree; previous winner starts |
| Server shows online count + client list | Server terminal **and** `/admin` dashboard |
| Server reset button | `/admin` → "Reset games & scores" |
| Server randomises who starts | `Room` constructor |
| Winner starts the rematch | `Room.rematch()` |

**Extra features** (for the submission table)

| # | Feature | AI? |
|---|---|---|
| 1 | **AI opponent** — 3 difficulties: random, hunt/target with parity, full probability-density search | ✓ |
| 2 | **AI shot advisor** — asks the same engine for the best square and paints a live probability heat-map | ✓ |
| 3 | Smart auto-deploy (`Randomise`) + anti-clustering fleet generator for the bot | |
| 4 | Lobby with live player list, direct challenges and quick-match queue | |
| 5 | Spectator mode — watch any live match (enemy fleets stay hidden) | |
| 6 | In-match chat with emote reactions and system commentary | |
| 7 | Reconnect & resume — refresh or drop Wi-Fi and keep your seat, score and board | |
| 8 | Turn-timeout auto-fire so a match never stalls | |
| 9 | Live stats: accuracy %, shot log, fleet-status pips | |
| 10 | Sound design (Web Audio, no assets), light/dark themes, full keyboard + screen-reader support | |

---

## 5. Troubleshooting

| Problem | Fix |
|---|---|
| Computer B can't open the page | Same network? Use the address the terminal printed, not `localhost`. Allow Node through the firewall (macOS: System Settings → Network → Firewall). |
| "Client not built" page | Run `npm run build` (or just `npm run play`). |
| Port 3000 already used | Change `NETWORK.PORT` in `shared/src/config.ts`. |
| "Unlock the server dashboard first" | Reset and Kick only work from a dashboard that entered the right `ADMIN_KEY`. |
| A tab suddenly shows "offline" | The same player was opened in a second (duplicated) tab; the newest tab keeps the seat. |
| Two players on one computer | Open two **separate tabs** — each tab is its own player. |
| Everything stuck | `/admin` → Reset games & scores. |
