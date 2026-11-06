// Mounts the real GroupBenefitsScreen through the groups-benefits-local entry (authenticated synthetic owner),
// and answers the requests that entry does not handle (history, catalog, joined pages, attendance, rankings).
// The wrapper is installed as the outermost fetch. Every response is synthetic; nothing is read from a live service.
// State switches (query string): joined=N|err, names=long, att=err|done, rank=N|err, mine=none (no own hearts, the dev shape), hist=N|err, catalog=off, delay=ms,
// points=N, tickets=N. auth=off / state=* / locale=* are handled by the groups-benefits-local entry.
import { DUKJIL_CATALOG, attendanceFor, historyEntries, joinedPages, rankingRows } from "./fixtures";

const original = window.fetch.bind(window);
let inner: typeof fetch | null = null;
const query = new URLSearchParams(location.search);
const number = (key: string, fallback: number) => { const value = Number(query.get(key)); return query.has(key) && Number.isFinite(value) ? value : fallback; };
// Check-in requests are recorded so a screen check (or test) can see which creator a dialog actually sent; a claimed page stays done.
const attended = new Set<string>();
const attendanceRequests: string[] = [];
Object.assign(window, { benefitsAttendanceRequests: attendanceRequests });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const failure = () => Response.json({ error: { code: "SYNTHETIC_FAILURE" } }, { status: 500 });
const outer: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  const delay = number("delay", 0);
  const slow = async () => { if (delay > 0) await wait(delay); };
  const longNames = query.get("names") === "long";
  if (url.pathname === "/api/me/wallet/history") {
    await slow();
    if (query.get("hist") === "err") return failure();
    return Response.json({ entries: historyEntries(number("hist", 8), longNames) });
  }
  if (url.pathname === "/api/dukjil/catalog") return Response.json(query.get("catalog") === "off" ? { version: null, rules: {}, missionBook: null } : DUKJIL_CATALOG);
  if (url.pathname === "/api/groups" && url.searchParams.get("mine") === "joined") {
    await slow();
    if (query.get("joined") === "err") return failure();
    return Response.json({ items: joinedPages(number("joined", 3), longNames), nextCursor: null });
  }
  if (url.pathname === "/api/me/dukjil/today") {
    const slug = url.searchParams.get("creator") ?? "";
    return Response.json({ kstDate: "2026-11-02", policyActive: true, totalPoints: 0, actions: {}, attendance: { attendedToday: attended.has(slug), streak: 1, nextBonusIn: 5 }, hasPassport: true });
  }
  const claim = /^\/api\/me\/attendance\/([^/]+)$/.exec(url.pathname);
  if (claim && init?.method === "POST") {
    attendanceRequests.push(decodeURIComponent(claim[1]));
    attended.add(decodeURIComponent(claim[1]));
    return Response.json({ points: 10, streak: 2, bonusPoints: 0, stampId: null, attendanceDate: "2026-11-02", replayed: false });
  }
  if (url.pathname === "/api/me/attendance") {
    await slow();
    if (query.get("att") === "err") return failure();
    return Response.json(attendanceFor(number("joined", 3), query.get("att") === "done", attended));
  }
  if (url.pathname === "/api/rankings/creators") {
    await slow();
    if (query.get("rank") === "err") return failure();
    return Response.json({ period: "week", periodStart: "2026-10-26", computedAt: "2026-11-02T01:00:00.000Z", rows: rankingRows(number("rank", 6), longNames, query.get("mine") === "none") });
  }
  if (url.pathname === "/api/me/wallet" && (query.has("points") || query.has("tickets") || delay > 0)) {
    await slow();
    const response = await (inner ?? original)(input, init);
    if (!response.ok) return response;
    const body = await response.json();
    return Response.json({ ...body, ...(query.has("points") ? { points: number("points", body.points) } : {}), ...(query.has("tickets") ? { tickets: number("tickets", body.tickets) } : {}) });
  }
  return (inner ?? original)(input, init);
};
Object.defineProperty(window, "fetch", { configurable: true, get: () => outer, set: (next: typeof fetch) => { inner = next; } });
await import("../groups-benefits-local/main");
