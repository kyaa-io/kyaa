// Loopback-only preview: actual product components, local browser fixtures, no DB.
import { createRequire } from "node:module";
import { realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.resolve(here, "../..");
const require = createRequire(import.meta.url);
const { createServer } = await import(require.resolve("vite", { paths: [require.resolve("vitest")] }));
export async function startHarness(port = 4198) {
  const server = await createServer({
    configFile: false, root: here, publicDir: path.join(web, "public"),
    cacheDir: path.join(web, "node_modules/.vite-gggi-local"), esbuild: { jsx: "automatic" },
    resolve: { alias: [
      { find: "@", replacement: web },
      { find: "@privy-io/react-auth", replacement: path.join(here, "privy.ts") },
      { find: "server-only", replacement: path.join(here, "../lounge-local/server-only.ts") },
      { find: "next/navigation", replacement: path.join(here, "../lounge-local/next-navigation.ts") },
      { find: "next/link", replacement: path.join(here, "../lounge-local/next-link.tsx") },
      { find: "next/image", replacement: path.join(here, "../mission-local/next-image.tsx") },
    ] },
    server: { host: "127.0.0.1", port, strictPort: true, fs: { allow: [web, path.resolve(web, "../.."), realpathSync(path.resolve(web, "../../node_modules"))] } },
    plugins: [{ name: "gggi-api-deny-network", configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        res.writeHead(501, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { code: "LOCAL_FIXTURE_ONLY" } }));
      });
    } }],
  });
  await server.listen();
  return { server, baseURL: `http://127.0.0.1:${port}` };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { baseURL } = await startHarness();
  console.log(`${baseURL}/gggi`);
}
