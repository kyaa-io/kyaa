// Keeps signed-in fans going when Privy is slow. While Privy answers, FanSessionKeeper trades its token for our own
// httpOnly session cookie (POST /api/auth/fan-session) and renews it every 10 minutes. If Privy takes longer than
// PRIVY_WAIT_MS, API calls send "Bearer kyaa-session" and the server reads the cookie instead. The hint below only says
// that a cookie was issued for this Privy user and until when; the cookie itself is never readable here.
export const FAN_SESSION_BEARER = "kyaa-session";
export const PRIVY_WAIT_MS = 2_000;
const HINT_KEY = "kyaa:fan-session";
export const RENEW_AFTER_MS = 10 * 60_000;
const COOKIE_LIFETIME_MS = 6 * 60 * 60_000;
// Stop using the cookie a minute early so a request does not reach the server just after it expired.
const EXPIRY_MARGIN_MS = 60_000;

interface Hint { pid: string; exp: number; at: number }

export function readFanSessionHint(now = Date.now()): Hint | null {
  try {
    const value = JSON.parse(localStorage.getItem(HINT_KEY) ?? "null") as Partial<Hint> | null;
    if (!value || typeof value.pid !== "string" || typeof value.exp !== "number" || typeof value.at !== "number") return null;
    return value.exp > now ? value as Hint : null;
  } catch {
    return null;
  }
}

function writeHint(hint: Hint | null) {
  try {
    if (hint) localStorage.setItem(HINT_KEY, JSON.stringify(hint));
    else localStorage.removeItem(HINT_KEY);
  } catch { /* 저장소가 막힌 기기는 쿠키 대체 없이 Privy만 쓴다. */ }
}

let issuing: Promise<void> | null = null;

async function issue(token: string, pid: string): Promise<void> {
  const issuedAt = Date.now();
  const response = await fetch("/api/auth/fan-session", {
    method: "POST", headers: { authorization: `Bearer ${token}` }, cache: "no-store", credentials: "same-origin",
  });
  if (response.status === 204) writeHint({ pid, exp: issuedAt + COOKIE_LIFETIME_MS - EXPIRY_MARGIN_MS, at: issuedAt });
  else if (response.status === 401 || response.status === 403) writeHint(null);
}

/** Issues or renews the cookie with a real Privy token, at most once per RENEW_AFTER_MS. Never blocks the caller. */
export function renewFanSession(token: string, pid: string, now = Date.now()): void {
  if (!token || token === FAN_SESSION_BEARER || token.startsWith("kyaa-email:")) return;
  const hint = readFanSessionHint(now);
  if (hint && hint.pid === pid && now - hint.at < RENEW_AFTER_MS) return;
  if (issuing) return;
  issuing = issue(token, pid).catch(() => undefined).finally(() => { issuing = null; });
}

/** Sign-out, or Privy saying nobody is signed in: drop the hint and ask the server to clear the cookie. */
export function clearFanSession(): void {
  const hadHint = readFanSessionHint(0) !== null;
  writeHint(null);
  if (!hadHint) return;
  void fetch("/api/auth/fan-session", { method: "DELETE", cache: "no-store", credentials: "same-origin", keepalive: true }).catch(() => undefined);
}

/**
 * Waits for Privy's token for at most PRIVY_WAIT_MS when this browser holds a current fan session for the same
 * Privy user, then answers with the cookie sentinel. Without such a session it waits for Privy as before.
 */
export async function withPrivyDeadline(getToken: () => Promise<string | null>, pid: string, wait = PRIVY_WAIT_MS): Promise<string | null> {
  const pending = getToken();
  if (readFanSessionHint()?.pid !== pid) return pending;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<typeof FAN_SESSION_BEARER>((resolve) => { timer = setTimeout(() => resolve(FAN_SESSION_BEARER), wait); });
  try {
    const first = await Promise.race([pending, late]);
    if (first === FAN_SESSION_BEARER) void pending.catch(() => undefined);
    return first;
  } finally {
    clearTimeout(timer);
  }
}
