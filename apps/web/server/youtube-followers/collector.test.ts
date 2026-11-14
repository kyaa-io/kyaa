import { describe, expect, it } from "vitest";
import { collectYouTubeFollowers, parseSubscriberCount } from "./collector";

const id = `UC${"a".repeat(22)}`;
const source = { celebrity_id: "artist", url: `https://www.youtube.com/channel/${id}` };
const response = (statistics: object) => new Response(JSON.stringify({ items: [{ id, statistics }] }), { status: 200 });

describe("YouTube followers", () => {
  it("floors to three significant digits, including zero", () => {
    expect(parseSubscriberCount({ items: [{ id, statistics: { subscriberCount: "1239999" } }] }, id)).toBe(1230000);
    expect(parseSubscriberCount({ items: [{ id, statistics: { subscriberCount: "0" } }] }, id)).toBe(0);
  });
  it("does not save a hidden or failed channel", async () => {
    const saved: unknown[] = [];
    const db = { sources: async () => [source], save: async (...args: unknown[]) => { saved.push(args); } };
    await collectYouTubeFollowers(db, "key", async () => response({ hiddenSubscriberCount: true, subscriberCount: "5000" }));
    await collectYouTubeFollowers(db, "key", async () => new Response("failure", { status: 500 }));
    expect(saved).toEqual([]);
  });
  it("saves a successful API result with source URL and time", async () => {
    const saved: unknown[] = [];
    const db = { sources: async () => [source], save: async (...args: unknown[]) => { saved.push(args); } };
    await collectYouTubeFollowers(db, "key", async () => response({ subscriberCount: "1999" }), () => new Date("2026-11-14T00:00:00Z"));
    expect(saved).toEqual([["artist", source.url, 1990, "2026-11-14T00:00:00.000Z"]]);
  });
});
