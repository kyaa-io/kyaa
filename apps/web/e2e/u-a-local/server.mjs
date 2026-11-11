// U-a local check (261107-2): the real header, page head and home ranking card on one page. Synthetic sign-in; rankings and the 덕질 catalog
// come from the local app (default http://localhost:3810, real local DB). Signed-in values (summary, today, wallet) are fixed fixtures.
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, "../..");
const app = process.env.U_A_LOCAL_APP ?? "http://localhost:3810";
const server = await createServer({
  configFile: false, root: here, publicDir: path.join(web, "public"), cacheDir: path.join(web, "node_modules/.vite-u-a-local"),
  esbuild: { jsx: "automatic" },
  resolve: { alias: [
    { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, "../kyaa-wave-participation-local/privy.ts") },
    { find: /.*byus-session-provider$/, replacement: path.join(here, "../kyaa-wave-participation-local/session.ts") },
    { find: /^.*\/auth-fallback$/, replacement: path.join(here, "../kyaa-wave-participation-local/privy.ts") },
    { find: "@", replacement: web },
    { find: "server-only", replacement: path.join(here, "../lounge-local/server-only.ts") },
    { find: "next/navigation", replacement: path.join(here, "../groups-local/navigation.ts") },
    ...["link", "image"].map(name => ({ find: `next/${name}`, replacement: path.join(here, `../mission-local/next-${name}.tsx`) })),
  ] },
  server: { host: "127.0.0.1", port: Number(process.env.U_A_LOCAL_PORT ?? 3811), strictPort: true, fs: { allow: [path.resolve(web, "../..")] },
    proxy: { "/api/rankings": app, "/api/dukjil/catalog": app } },
});
await server.listen();
console.log(`u-a-local http://127.0.0.1:${server.config.server.port} (rankings from ${app})`);
