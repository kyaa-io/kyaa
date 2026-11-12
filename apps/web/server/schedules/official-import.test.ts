import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]) }));
vi.mock("node:dns/promises", () => ({ default: { lookup }, lookup }));

import { importOfficialSchedule } from "./official-import";

beforeEach(() => lookup.mockClear());

it("imports only verified JSON-LD Event fields", async () => {
  const fetcher = vi.fn(async () => new Response(`<!doctype html><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "Event", name: "NCHIVE fan signing",
    startDate: "2026-10-24T14:00:00+09:00", endDate: "2026-10-24T16:00:00+09:00",
    location: { "@type": "Place", name: "NCHIVE Hall" }, description: "Meet the artist",
    image: "https://example.test/private-tracking-image.jpg",
  })}</script>`, { headers: { "content-type": "text/html; charset=utf-8" } }));
  await expect(importOfficialSchedule("https://example.test/notice", { resolve: lookup, transport: async () => { const r = await fetcher(); return { status: r.status, headers: Object.fromEntries(r.headers), bytes: Buffer.from(await r.arrayBuffer()) }; } })).resolves.toEqual({
    kind: "event", title: "NCHIVE fan signing", startsAt: "2026-10-24T05:00:00.000Z", endsAt: "2026-10-24T07:00:00.000Z",
    timeZone: "UTC", location: "NCHIVE Hall", participationInstructions: undefined, description: "Meet the artist",
    officialSourceUrl: "https://example.test/notice",
  });
  expect(fetcher).toHaveBeenCalledOnce();
});

it("rejects private destinations before fetching", async () => {
  const fetcher = vi.fn();
  await expect(importOfficialSchedule("https://127.0.0.1/event", { resolve: lookup, transport: async () => { const r = await fetcher(); return { status: r.status, headers: Object.fromEntries(r.headers), bytes: Buffer.from(await r.arrayBuffer()) }; } })).rejects.toThrow("FAN_WEB_OFFICIAL_IMPORT_INVALID_SOURCE");
  expect(fetcher).not.toHaveBeenCalled();
});

it("fails closed when no Event metadata exists", async () => {
  const fetcher = vi.fn(async () => new Response("<title>ordinary page</title>", { headers: { "content-type": "text/html" } }));
  await expect(importOfficialSchedule("https://example.test/page", { resolve: lookup, transport: async () => { const r = await fetcher(); return { status: r.status, headers: Object.fromEntries(r.headers), bytes: Buffer.from(await r.arrayBuffer()) }; } })).rejects.toThrow("FAN_WEB_OFFICIAL_IMPORT_NOT_FOUND");
});

it.each(["100.64.0.1", "198.18.0.1", "::ffff:127.0.0.1", "::ffff:7f00:1"])("blocks resolved special address %s", async address => {
  const transport = vi.fn();
  await expect(importOfficialSchedule("https://example.test", { resolve: async () => [{ address, family: address.includes(":") ? 6 : 4 }], transport })).rejects.toThrow("FAN_WEB_OFFICIAL_IMPORT_INVALID_SOURCE");
  expect(transport).not.toHaveBeenCalled();
});

it("pins the first DNS answer without resolving again for connection", async () => {
  const resolve = vi.fn().mockResolvedValueOnce([{ address: "8.8.8.8", family: 4 }]).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
  const transport = vi.fn(async () => ({ status: 200, headers: { "content-type": "text/html" }, bytes: Buffer.from('<script type="application/ld+json">{"@type":"Event","name":"Event"}</script>') }));
  await importOfficialSchedule("https://example.test", { resolve, transport });
  expect(resolve).toHaveBeenCalledOnce();
  expect(transport).toHaveBeenCalledWith(expect.any(URL), { address: "8.8.8.8", family: 4 }, 512 * 1024, expect.any(AbortSignal));
});

it.each([
  [200, "image/png", 1, "FAILED"],
  [503, "text/html", 1, "FAILED"],
  [200, "text/html", 512 * 1024 + 1, "TOO_LARGE"],
] as const)("maps response %s %s %s to %s", async (status, type, size, code) => {
  await expect(importOfficialSchedule("https://example.test", { resolve: lookup, transport: async () => ({ status, headers: { "content-type": type }, bytes: Buffer.alloc(size) }) })).rejects.toThrow(`FAN_WEB_OFFICIAL_IMPORT_${code}`);
});
