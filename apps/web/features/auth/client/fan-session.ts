// Only a non-secret hint is readable here. The sealed credential stays in an HttpOnly cookie.
export const FAN_SESSION_BEARER = "kyaa-session";
const HINT_KEY = "kyaa:fan-session";
export const RECHECK_AFTER_MS = 24 * 60 * 60_000;
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
let pendingFetch: Promise<unknown> | null = null;
let running: Promise<void> | null = null;
async function exchange(token: string, pid: string, ownerGeneration: number, preserveHintOnUnauthorized = false): Promise<boolean> {
  if (generation !== ownerGeneration) return false;
  const operation = (async () => {
    const response = await fetch("/api/auth/fan-session", { method: "POST", headers: { authorization: `Bearer ${token}` }, cache: "no-store", credentials: "same-origin" });
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
      if (body?.error?.code !== "PRIVY_PROOF_REQUIRED" && !(response.status === 401 && preserveHintOnUnauthorized)) writeHint(null);
    }
    return false;
  })();
  pendingFetch = operation;
  try { return await operation; } finally { if (pendingFetch === operation) pendingFetch = null; }
}
/** Runs once per page entry. Cookie renewal never waits for Privy. Daily proof refresh runs afterwards. */
export function renewFanSession(getPrivyToken: () => Promise<string | null>, pid: string): Promise<void> {
  if (activePid !== pid) { cancelFanSessionMaintenance(); activePid = pid; }
  if (running) return running;
  const ownerGeneration = generation;
  const previousFetch = pendingFetch;
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

/** Wait for any cookie response before deleting, so an in-flight issue cannot restore a signed-out cookie. */
export async function clearFanSession(): Promise<void> {
  const previousHint = readFanSessionHint();
  cancelFanSessionMaintenance();
  writeHint(null);
  await pendingFetch?.catch(() => undefined);
  try {
    const response = await fetch("/api/auth/fan-session", { method: "DELETE", cache: "no-store", credentials: "same-origin", keepalive: true });
    if (!response.ok) throw new Error("Session sign-out failed");
  } catch (error) { writeHint(previousHint); throw error; }
}
