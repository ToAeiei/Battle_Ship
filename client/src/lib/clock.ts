/**
 * The server stamps deadlines with ITS clock. Two computers rarely agree to the
 * second, so every state push carries `serverNow` and countdowns are measured
 * against the server's time, not this browser's.
 */
let offset = 0;

export const syncClock = (serverNow: number) => {
  if (Number.isFinite(serverNow)) offset = serverNow - Date.now();
};

/** The current time as the server sees it (epoch ms). */
export const serverTime = () => Date.now() + offset;
