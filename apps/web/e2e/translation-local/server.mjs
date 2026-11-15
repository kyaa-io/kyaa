import { createServer } from "vite";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { translated } from "./fixtures.mjs";

export async function createTranslationFixtureServer(port = 4217) {
  const here = import.meta.dirname, web = path.resolve(here, "../.."), root = path.resolve(web, "../..");
  return createServer({ configFile: false, root: here, publicDir: path.join(web, "public"), cacheDir: path.join(root, "work/translation-ui/vite"), esbuild: { jsx: "automatic" },
    plugins: [{ name: "synthetic-translation-api", configureServer(server) {
      // Synthetic fixtures only; this server never reads production accounts or calls Google.
      server.middlewares.use(async (request, response, next) => {
        if (request.url?.startsWith("/api/content-assets/")) {
          response.setHeader("Content-Type", "image/jpeg");
          response.end(await readFile(path.join(web, "public/images/guest-home", request.url.endsWith("1") ? "elina-card.jpg" : "changha-card.jpg"))); return;
        }
        if (!/^\/api\/(?:content|display)-translations$/.test(request.url ?? "")) return next();
        try {
          let body = ""; for await (const chunk of request) { body += chunk; if (body.length > 100_000) throw new Error(); }
          const input = JSON.parse(body), text = translated[input.targetLocale]; if (!text) throw new Error();
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify(input.targetId ? { targetType: input.targetType, targetId: input.targetId, targetLocale: input.targetLocale, translatedText: text, sourceRevision: 1, cached: false }
            : input.texts ? { translatedTexts: input.texts.map(() => text), cached: false } : { translatedText: text, cached: false }));
        } catch { response.statusCode = 400; response.end(); }
      });
    } }],
    resolve: { alias: [
      { find: "@/components/byus-session-provider", replacement: path.join(here, "session.ts") },
      { find: "@/features/auth/client/cognito-auth", replacement: path.join(here, "../community-stamps-local/privy.ts") },
      { find: "next/navigation", replacement: path.join(here, "../community-stamps-local/next-navigation.ts") },
      { find: "@", replacement: web },
      { find: "@privy-io/react-auth", replacement: path.join(here, "../community-stamps-local/privy.ts") },
      { find: "next/link", replacement: path.join(here, "../mission-local/next-link.tsx") },
    ] }, server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [root] } } });
}
