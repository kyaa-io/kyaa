// Starts the two loopback harnesses the screen-baseline test needs. Fixed synthetic data only.
//  - 3191: home (this folder, the real StreamingGuestHome)
//  - 3192: the shared groups-local harness (groups directory, synthetic fetch)
//  - 3193: benefits-local aliases + benefits.tsx (the real GroupBenefitsScreen with history; groups-local renders a different benefits view)
import { createServer } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url)), web = path.resolve(here, "../..");
const cache = path.join(web, "node_modules/.vite-screen-baseline");
// Ports default to 3191/3192/3193; set SCREEN_BASELINE_HOME_PORT / _GROUPS_PORT / _BENEFITS_PORT when another checkout already uses them.
const port = (name, fallback) => Number(process.env[`SCREEN_BASELINE_${name}_PORT`] ?? fallback);
const ports = { home: port("HOME", 3191), groups: port("GROUPS", 3192), benefits: port("BENEFITS", 3193) };
process.env.GROUPS_LOCAL_CACHE_DIR = path.join(cache, "groups");
const { startHarness } = await import("../groups-local/server.mjs");
const home = await createServer({
  configFile: false, root: here, publicDir: path.join(web, "public"), cacheDir: path.join(cache, "home"),
  esbuild: { jsx: "automatic" },
  resolve: { alias: [
    { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, "../kyaa-wave-participation-local/privy.ts") },
    { find: /.*byus-session-provider$/, replacement: path.join(here, "../kyaa-wave-participation-local/session.ts") },
    { find: "@", replacement: web },
    { find: "server-only", replacement: path.join(here, "../lounge-local/server-only.ts") },
    { find: "next/navigation", replacement: path.join(here, "../groups-local/navigation.ts") },
    { find: "@privy-io/react-auth", replacement: path.join(here, "../kyaa-wave-participation-local/privy.ts") },
    ...["link", "image"].map(name => ({ find: `next/${name}`, replacement: path.join(here, `../mission-local/next-${name}.tsx`) })),
  ] },
  server: { host: "127.0.0.1", port: ports.home, strictPort: true, fs: { allow: [path.resolve(web, "../..")] } },
});
const benefits = await createServer({
  configFile: false, root: here, publicDir: path.join(web, "public"), cacheDir: path.join(cache, "benefits"),
  esbuild: { jsx: "automatic" },
  plugins: [{ name: "benefits-entry", configureServer: srv => { srv.middlewares.use((req, _res, next) => { if (req.url && /^\/benefits(\?|$)/.test(req.url)) req.url = req.url.replace("/benefits", "/benefits.html"); next(); }); } }],
  resolve: { alias: [
    { find: /.*features\/auth\/client\/cognito-auth$/, replacement: path.join(here, "../groups-benefits-local/auth.ts") },
    { find: /.*byus-session-provider$/, replacement: path.join(here, "../groups-benefits-local/auth.ts") },
    { find: /.*use-admin-session$/, replacement: path.join(here, "../groups-benefits-local/auth.ts") },
    { find: "next/navigation", replacement: path.join(here, "../groups-benefits-local/navigation.ts") },
    { find: "next/link", replacement: path.join(here, "../groups-benefits-local/link.tsx") },
    { find: "next/image", replacement: path.join(here, "../groups-benefits-local/image.tsx") },
    { find: "@privy-io/react-auth", replacement: path.join(here, "../groups-benefits-local/auth.ts") },
    { find: "server-only", replacement: path.join(here, "../groups-benefits-local/server-only.ts") },
    { find: "@", replacement: web },
  ] },
  server: { hmr: false, host: "127.0.0.1", port: ports.benefits, strictPort: true, fs: { allow: [path.resolve(web, "../..")] } },
});
await home.listen();
await benefits.listen();
await startHarness(ports.groups);
console.log(`screen-baseline harness ready: home ${ports.home}, groups ${ports.groups}, benefits ${ports.benefits}`);
