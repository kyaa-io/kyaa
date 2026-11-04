import path from "node:path";
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../..");
export async function startHarness({ port = 4193 } = {}) {
  const server = await createServer({
    plugins: [{ name: "banner-local-api", configureServer(server) { server.middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith("/api/")) return next();
    if (req.url.startsWith("/api/content-assets/")) {
      res.setHeader("content-type", "image/jpeg");
      return res.end(await readFile(path.join(web, "public/images/guest-home", req.url.includes("222222222222") ? "changha-card.jpg" : "elina-card.jpg")));
    }
    res.setHeader("content-type", "application/json");
    if (req.headers.referer?.includes("scenario=home-polish")) {
      if (req.url.startsWith("/api/me/summary")) return res.end(JSON.stringify({ summary: {
        profile: { nickname: "Preview Fan" }, creators: [], live: { upcoming: [], history: [] },
        rewards: { availableCount: 0, entries: 0, items: [] }, collection: { passportCount: 0, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0,
      } }));
      if (req.url.startsWith("/api/public/home-feed")) return res.end(JSON.stringify({ hasMore: true, items: [0,1,2,3].map((n) => ({
        creatorSlug: "changha", creatorName: "창하", item: {
          kind: "fan_post", id: `11111111-1111-4111-8111-${String(n+1).padStart(12,"0")}`, celebritySlug: "changha", body: n % 2 ? "오늘도 함께 응원해요! 좋은 하루 보내세요." : "공연에서 함께한 즐거운 순간을 오래 기억하고 싶어요. 다음에도 만나요!", visibility: "public", revision: 1,
          author: { nickname: n === 2 ? "긴이름을사용하는팬LongNickname" : "Preview Fan", avatarUrl: "/images/avatars/star-pink.webp" }, assets: n % 2 ? [] : [{id: n === 2 ? "22222222-2222-4222-8222-222222222222" : "33333333-3333-4333-8333-333333333333",width:1080,height:1080}], createdAt: "2026-11-03T00:00:00Z", updatedAt: "2026-11-03T00:00:00Z", isOwner: false, likeCount: [0,12,1234,7][n], commentCount: [0,3,56,1][n], liked: false,
        },
      })) }));
    }
    res.end(JSON.stringify(req.url.startsWith("/api/public/live-now") ? { items: [], targets: [], checkedAt: new Date().toISOString() } : { states: {} }));
  }); } }],
    configFile: false, esbuild: { jsx: "automatic" }, root: here, publicDir: path.join(web, "public"),
    cacheDir: path.join(web, "node_modules/.vite-banner-local"),
    resolve: { alias: [
      { find: "@/components/byus-session-provider", replacement: path.join(here, "../translation-local/session.ts") },
      { find: "@", replacement: web },
      { find: "next/navigation", replacement: path.join(here, "next-navigation.ts") },
      ...["next/link", "next/image", "server-only"].map(name => ({ find: name, replacement: path.join(web, "e2e/mission-local", { "next/link": "next-link.tsx", "next/image": "next-image.tsx", "next/navigation": "next-navigation.ts", "server-only": "server-only.ts" }[name]) })),
      { find: "@privy-io/react-auth", replacement: path.join(here, "privy.ts") },
    ] },
    server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [web, realpathSync(path.resolve(web, "../../node_modules")), realpathSync(path.resolve(web, "../../node_modules/pretendard"))] } },
    define: { "process.env.NEXT_PUBLIC_APP_URL": JSON.stringify(`http://localhost:${port}`) },
  });

  await server.listen();
  return { baseURL: `http://127.0.0.1:${port}`, close: () => server.close() };
}
