import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn(async () => [{ address: "203.0.113.8", family: 4 }]) }));
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
  await expect(importOfficialSchedule("https://example.test/notice", fetcher as typeof fetch)).resolves.toEqual({
    kind: "event", title: "NCHIVE fan signing", startsAt: "2026-10-24T05:00:00.000Z", endsAt: "2026-10-24T07:00:00.000Z",
    timeZone: "UTC", location: "NCHIVE Hall", participationInstructions: undefined, description: "Meet the artist",
    officialSourceUrl: "https://example.test/notice",
  });
  expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ hostname: "example.test" }), expect.objectContaining({ redirect: "manual" }));
});

it("rejects private destinations before fetching", async () => {
  const fetcher = vi.fn();
  await expect(importOfficialSchedule("https://127.0.0.1/event", fetcher as typeof fetch)).rejects.toThrow("FAN_WEB_OFFICIAL_IMPORT_INVALID_SOURCE");
  expect(fetcher).not.toHaveBeenCalled();
});

it("fails closed when no Event metadata exists", async () => {
  const fetcher = vi.fn(async () => new Response("<title>ordinary page</title>", { headers: { "content-type": "text/html" } }));
  await expect(importOfficialSchedule("https://example.test/page", fetcher as typeof fetch)).rejects.toThrow("FAN_WEB_OFFICIAL_IMPORT_NOT_FOUND");
});
