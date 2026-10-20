import path from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { stageFixture, completedStage, metricsFixture, presentationFixture, tiktokFixture } from "./fixture.ts";
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../..");
export async function startHarness({ port = 4216 } = {}) {
  const draws = new Map();
  const api = (req, res, next) => {
    if (!req.url?.startsWith("/api/")) return next();
    const referer = new URL(req.headers.referer ?? `http://localhost:${port}`);
    const scenario = referer.searchParams.get("scenario");
    res.setHeader("content-type", "application/json");
    let body;
    if (req.url === "/api/admin/wave-stage") {
      if (scenario === "error") { res.statusCode = 503; body = {}; }
      else if (scenario === "denied") { res.statusCode = 403; body = {}; }
      else body = { stage: draws.get(referer.search) ?? (scenario === "results" || scenario === "long" ? completedStage(scenario === "long") : scenario === "empty" ? { ...stageFixture, creators: stageFixture.creators.map(c => ({ ...c, participantCount: 0 })) } : scenario === "conflict" ? { ...stageFixture, drawConflict: true } : stageFixture) };
    } else if (req.url === "/api/admin/wave-stage/draw") {
      if (scenario === "retry" && !draws.has(referer.search)) { draws.set(referer.search, completedStage()); res.statusCode = 503; body = {}; }
      else { body = { stage: completedStage() }; draws.set(referer.search, body.stage); }
    } else if (req.url.startsWith("/api/admin/wave-stage/presentation")) {
      const scope = new URL(req.url, referer).searchParams.get("scope") ?? "all";
      if (scenario === "error") { res.statusCode = 503; body = {}; }
      else if (scenario === "denied") { res.statusCode = 403; body = {}; }
      else body = { ...presentationFixture, scope, from: scope === "all" ? null : "2026-10-21T15:00:00Z", to: scope === "all" ? presentationFixture.asOf : "2026-10-22T15:00:00Z", ...(scenario === "empty" ? { creators: presentationFixture.creators.map(c => ({ ...c, reservations: 0, passports: 0, likes: 0, comments: 0, engagedFans: 0 })), missions: { participants: 0, items: presentationFixture.missions.items.map(item => ({ ...item, completed: 0 })) } } : {}) };
    } else if (req.url === "/api/admin/wave-stage/tiktok") body = { ...tiktokFixture, creators: tiktokFixture.creators.map(item => scenario === "error" ? { slug: item.slug, state: "unavailable", observedAt: new Date().toISOString() } : { ...item, observedAt: new Date().toISOString() }) };
    else if (req.url === "/api/public/live-dashboard") body = scenario === "chain-error" ? { ...metricsFixture, onchain: { state: "unavailable" } } : metricsFixture;
    else if (req.url?.includes("/playback")) { res.statusCode = 410; body = {}; }
    else { res.statusCode = 404; body = {}; }
    const finish = () => res.end(JSON.stringify(body));
    if (req.method === "POST" && scenario === "busy") setTimeout(finish, 3000); else finish();
  };
  const server = await createServer({ plugins: [{ name: "wave-stage-fixture", configureServer(server) { server.middlewares.use(api); } }], configFile: false, esbuild: { jsx: "automatic" }, root: here,
    publicDir: path.join(web, "public"), cacheDir: path.join(web, "node_modules/.vite-wave-stage-local"),
    resolve: { alias: [
      { find: "@", replacement: web },
      { find: "@privy-io/react-auth", replacement: path.join(here, "privy.ts") },
      ...["next/link", "next/image", "next/navigation", "server-only"].map(name => ({ find: name, replacement: path.join(web, "e2e/mission-local", { "next/link": "next-link.tsx", "next/image": "next-image.tsx", "next/navigation": "next-navigation.ts", "server-only": "server-only.ts" }[name]) })),
    ] }, server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [web, realpathSync(path.resolve(web, "../../node_modules"))] } } });
  await server.listen();
  return { baseURL: `http://127.0.0.1:${port}`, close: () => server.close() };
}
if (process.argv.includes("--serve")) { const harness = await startHarness(); console.log(harness.baseURL); }
