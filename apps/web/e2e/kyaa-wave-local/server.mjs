import path from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createPhotocardFixture } from "./photocards.mjs";
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../..");
export async function startHarness({ port = 4198, photocardDirectory = process.env.KYAA_PHOTOCARD_QA_DIR } = {}) {
 const entries = new Set();
 const photocards = createPhotocardFixture(photocardDirectory);
 const api = async (req, res, next) => {
  if (!req.url?.startsWith("/api/")) return next();
  res.setHeader("content-type", "application/json");
  const referer = new URL(req.headers.referer ?? `http://localhost:${port}`);
  const slug = req.url.includes("/wena/") ? "wena" : "changha";
  const scenario = referer.searchParams.get("scenario");
  const entered = entries.has(slug) || scenario === "entered" || scenario === "reserved" || Boolean(scenario?.startsWith("photocard"));
  const reserved = scenario === "reserved";
  let body = {};
  if(await photocards.handle(req,res,scenario,entered))return;
  if (req.url.includes("/cheer-event") && scenario === "event-error") { res.statusCode = 503; res.end(JSON.stringify({error:{code:"UNAVAILABLE"}})); return; }
  if (req.url.includes("/cheer-event")) body = { event: { campaignId: slug === "wena" ? "90000000-0000-4000-8000-000000000002" : "90000000-0000-4000-8000-000000000001", creatorSlug: slug, liveEventId: "91000000-0000-4000-8000-000000000001", liveSlug: `${slug}-kyaa-wave`, liveStartsAt: "2026-10-22T10:45:00Z", reservationOpensAt: "2026-10-18T00:00:00Z", reservationClosesAt: "2026-10-22T10:45:00Z", reservationAvailable: scenario !== "reservation-closed", entryOpensAt: "2026-10-18T00:00:00Z", entryClosesAt: "2026-10-22T13:00:00Z", status: scenario === "closed" ? "closed" : "open", photocard: { collectionId: photocards.collectionId(slug), title: "Photocard", eligible: req.headers.authorization ? entered : null, assets: photocards.assets(slug,req.headers.authorization) }, prizes: [ ...(slug === "changha" ? [{ benefitId: "92000000-0000-4000-8000-000000000001", title: "창하 팬 커피챗", kind: "coffee_chat", imageUrl: null, winnerQuantity: 20 }] : []), { benefitId: "92000000-0000-4000-8000-000000000002", title: "엘리에나 커피 2잔", kind: "hotel_coffee", imageUrl: "/images/kyaa-wave/eliena-cafe-01.jpg", winnerQuantity: 5 } ], participation: req.headers.authorization ? { entered, enteredAt: entered ? "2026-10-18T02:00:00Z" : null, reserved, weight: reserved ? 2 : 1 } : null } };
  else if (req.url.includes("/cheers")) {
   if (req.method === "POST") { entries.add(slug); body = { id: "93000000-0000-4000-8000-000000000001", replayed: entered }; }
   else body = { total: 0, comments: [], nextCursor: null };
  } else if (req.url.includes("/fans?")) body = { likeCount: 1200, fanCount: 1200, publicFanCount: 0, fans: [] };
  else if (req.url.includes("/raffles")) body = { raffles: [] };
  else if (req.url.includes("/fanpage")) body = { membershipCount: 1200, fanCount: 1200, leaderboardAvailable: true, activity: [] };
  else if (req.url.includes("/leaderboard")) body = { membershipCount: 1200, fanCount: 1200, available: true, asOf: new Date().toISOString(), rows: [], me: null };
  else if (req.url.includes("/calendar")) { const month = new URL(req.url, referer).searchParams.get("month") ?? "2026-10"; body = { month, timeZone: "Asia/Seoul", days: Array.from({ length: 31 }, (_, i) => ({ date: `${month}-${String(i+1).padStart(2,"0")}`, events: [] })) }; }
  else if (req.url.includes("/notices")) body = { notices: [], nextCursor: null };
  else if (/youtube|instagram|media|chzzk|schedules/.test(req.url)) body = { items: [], nextCursor: null };
  else if (req.url.includes("/reactions")) body = { completed: false };
  else if (req.url.includes("/live-now")) body = { items: [], targets: [], checkedAt: new Date().toISOString() };
  else if (req.url.includes("/live-events?")) body = { catalog: { replay: [] } };
  res.end(JSON.stringify(body));
  };
 const server = await createServer({ configFile: false, plugins: [{ name: "kyaa-wave-fixture", configureServer(server) { server.middlewares.use(api); } }], esbuild: { jsx: "automatic" }, root: here, publicDir: path.join(web, "public"), cacheDir: path.join(web, "node_modules/.vite-kyaa-wave-local"),
 resolve: { alias: [
  { find: /(?:.*\/)?byus-session-provider$/, replacement: path.join(here, "session.ts") },
  { find: "@", replacement: web },
  ...["next/link", "next/image", "next/navigation", "server-only"].map(name => ({ find: name, replacement: path.join(web, "e2e/mission-local", { "next/link": "next-link.tsx", "next/image": "next-image.tsx", "next/navigation": "next-navigation.ts", "server-only": "server-only.ts" }[name]) })),
  { find: "@privy-io/react-auth", replacement: path.join(here, "privy.ts") },
 ] }, server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [web, realpathSync(path.resolve(web, "../../node_modules"))] } }, define: { "process.env.NEXT_PUBLIC_APP_URL": JSON.stringify(`http://localhost:${port}`) } });

 await server.listen();
 return { baseURL: `http://127.0.0.1:${port}`, close: () => server.close() };
}
if (process.argv.includes("--serve")) { const h = await startHarness(); console.log(h.baseURL); }
