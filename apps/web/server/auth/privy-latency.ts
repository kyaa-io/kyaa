// Every network call our server makes to Privy reports how long it took (event privy_latency). A call over
// PRIVY_SLOW_MS also logs privy_latency_slow at warn level, which is what the alarm watches.
export const PRIVY_SLOW_MS = 3_000;

export type PrivyCall = "jwks" | "users.get";

export async function measurePrivyCall<T>(call: PrivyCall, run: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const started = now();
  let outcome: "ok" | "error" = "error";
  try {
    const value = await run();
    outcome = "ok";
    return value;
  } finally {
    const ms = Math.max(0, now() - started);
    const line = JSON.stringify({ event: "privy_latency", call, ms, outcome });
    console.info(line);
    if (ms > PRIVY_SLOW_MS) console.warn(JSON.stringify({ event: "privy_latency_slow", call, ms, outcome }));
  }
}
