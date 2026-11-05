// Mounts the real GroupBenefitsScreen through the groups-benefits-local entry (authenticated synthetic owner),
// and answers the wallet history request that entry does not handle. The wrapper is installed as the outermost fetch.
import { HISTORY_ENTRIES } from "./fixtures";

const original = window.fetch.bind(window);
let inner: typeof fetch | null = null;
const outer: typeof fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.origin);
  if (url.pathname === "/api/me/wallet/history") return Response.json({ entries: HISTORY_ENTRIES });
  return (inner ?? original)(input, init);
};
Object.defineProperty(window, "fetch", { configurable: true, get: () => outer, set: (next: typeof fetch) => { inner = next; } });
await import("../groups-benefits-local/main");
