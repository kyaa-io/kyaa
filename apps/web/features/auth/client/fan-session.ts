// Only a non-secret hint is readable here. The sealed credential stays in an HttpOnly cookie.
export const FAN_SESSION_BEARER = "kyaa-session";
const HINT_KEY = "kyaa:fan-session";
export const RECHECK_AFTER_MS = 24 * 60 * 60_000;
/** Covers connecting, headers and reading the body. A request that outlives it is aborted, never left running. */
export const FAN_SESSION_REQUEST_TIMEOUT_MS = 10_000;
interface Hint { pid: string; exp: number; at: number }
export function readFanSessionHint(now = Date.now()): Hint | null {
  try {
    const value = JSON.parse(localStorage.getItem(HINT_KEY) ?? "null") as Partial<Hint> | null;
    return value && typeof value.pid === "string" && typeof value.exp === "number" && typeof value.at === "number" && value.exp > now ? value as Hint : null;
  } catch { return null; }
}
function writeHint(hint: Hint | null) {
  try {
    if (hint) localStorage.setItem(HINT_KEY, JSON.stringify(hint));
    else localStorage.removeItem(HINT_KEY);
    window.dispatchEvent(new Event("kyaa:fan-session-changed"));
  } catch { /* Storage denial leaves the existing Privy request path available. */ }
}
let generation = 0;
let activePid: string | null = null;
let pendingFetch: { operation: Promise<unknown>; abort: () => void } | null = null;
let running: Promise<void> | null = null;
async function exchange(token: string, pid: string, ownerGeneration: number, preserveHintOnUnauthorized = false): Promise<boolean> {
  if (generation !== ownerGeneration) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FAN_SESSION_REQUEST_TIMEOUT_MS);
  const operation = (async () => {
    const response = await fetch("/api/auth/fan-session", { method: "POST", headers: { authorization: `Bearer ${token}` }, cache: "no-store", credentials: "same-origin", signal: controller.signal });
    if (generation !== ownerGeneration) return false;
    if (response.ok) {
      const body = await response.json() as { session?: boolean; exp?: number; authenticatedAt?: number };
      if (generation !== ownerGeneration) return false;
      if (body.session && typeof body.exp === "number" && typeof body.authenticatedAt === "number") {
        writeHint({ pid, exp: body.exp, at: body.authenticatedAt });
        return true;
      }
      writeHint(null);
    } else if (response.status === 401 || response.status === 403) {
      const body = await response.json().catch(() => null) as { error?: { code?: string } } | null;
      // A body that stalled or was aborted says nothing about the verdict, so the hint stays.
      if (controller.signal.aborted || generation !== ownerGeneration) return false;
      if (body?.error?.code !== "PRIVY_PROOF_REQUIRED" && !(response.status === 401 && preserveHintOnUnauthorized)) writeHint(null);
    }
    return false;
  })();
  const entry = { operation, abort: () => controller.abort() };
  pendingFetch = entry;
  try { return await operation; } finally { clearTimeout(timer); if (pendingFetch === entry) pendingFetch = null; }
}
/** Runs once per page entry. Cookie renewal never waits for Privy. Daily proof refresh runs afterwards. */
export function renewFanSession(getPrivyToken: () => Promise<string | null>, pid: string): Promise<void> {
  if (activePid !== pid) { cancelFanSessionMaintenance(); activePid = pid; }
  if (running) return running;
  const ownerGeneration = generation;
  const previousFetch = pendingFetch?.operation;
  const operation = (async () => {
    await previousFetch?.catch(() => undefined);
    if (generation !== ownerGeneration) return;
    const hint = readFanSessionHint();
    if (hint?.pid === pid) {
      await exchange(FAN_SESSION_BEARER, pid, ownerGeneration);
      if (readFanSessionHint()?.pid === pid && Date.now() - hint.at < RECHECK_AFTER_MS) return;
    }
    if (generation !== ownerGeneration) return;
    const token = await getPrivyToken();
    if (token && token !== FAN_SESSION_BEARER && !token.startsWith("kyaa-email:")) await exchange(token, pid, ownerGeneration, readFanSessionHint()?.pid === pid);
  })().catch(() => undefined).finally(() => { if (running === operation) running = null; });
  running = operation;
  return operation;
}
export function cancelFanSessionMaintenance(): void {
  generation += 1;
  activePid = null;
  running = null;
}

/** Abort any renewal and wait until it has settled, so no cookie response can arrive after the delete. Both requests are time-limited. */
export async function clearFanSession(): Promise<void> {
  const previousHint = readFanSessionHint();
  cancelFanSessionMaintenance();
  writeHint(null);
  const inflight = pendingFetch;
  inflight?.abort();
  await inflight?.operation.catch(() => undefined);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FAN_SESSION_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch("/api/auth/fan-session", { method: "DELETE", cache: "no-store", credentials: "same-origin", keepalive: true, signal: controller.signal });
    if (!response.ok) throw new Error("Session sign-out failed");
  } catch (error) { writeHint(previousHint); throw error; }
  finally { clearTimeout(timer); }
}
