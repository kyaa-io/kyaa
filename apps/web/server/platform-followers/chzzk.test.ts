import { describe, expect, it, vi } from "vitest";
import { collectChzzkFollowers, parseChzzkFollowerCount } from "./chzzk";

const id = "0a3f97086cb81d3360c69fdf5d020045";
const url = `https://chzzk.naver.com/${id}`;
const body = (data: unknown[]) => ({ code: 200, message: null, content: { data } });

describe("CHZZK follower counts", () => {
  it("reads the exact count of the asked channel only", () => {
    expect(parseChzzkFollowerCount(body([{ channelId: id, channelName: "x", followerCount: 1234 }]), id)).toBe(1234);
    expect(parseChzzkFollowerCount(body([{ channelId: id, followerCount: 0 }]), id)).toBe(0);
    expect(parseChzzkFollowerCount(body([{ channelId: "f".repeat(32), followerCount: 9 }]), id)).toBeNull();
    expect(parseChzzkFollowerCount(body([{ channelId: id }]), id)).toBeNull();
    expect(parseChzzkFollowerCount({ code: 401, content: null }, id)).toBeNull();
  });
  it("calls the official channel API with client credentials and saves the count", async () => {
    const save = vi.fn(async () => undefined);
    const fetcher = vi.fn(async () => Response.json(body([{ channelId: id, followerCount: 1234 }])));
    const result = await collectChzzkFollowers({ sources: async () => [{ celebrity_id: "c", url }, { celebrity_id: "d", url: "https://example.com/x" }], save },
      { clientId: "client", clientSecret: "secret" }, fetcher as unknown as typeof fetch, () => new Date("2026-11-16T00:00:00Z"));
    expect(result).toEqual({ saved: 1, skipped: 1, failed: 0 });
    const [requested, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(requested.href).toBe(`https://openapi.chzzk.naver.com/open/v1/channels?channelIds=${id}`);
    expect(init.headers).toMatchObject({ "Client-Id": "client", "Client-Secret": "secret" });
    expect(save).toHaveBeenCalledWith("c", url, 1234, "2026-11-16T00:00:00.000Z");
  });
  it("keeps the old count when the API fails or hides it", async () => {
    const save = vi.fn(async () => undefined);
    const failing = vi.fn(async () => new Response("no", { status: 429 }));
    expect(await collectChzzkFollowers({ sources: async () => [{ celebrity_id: "c", url }], save }, { clientId: "a", clientSecret: "b" }, failing as unknown as typeof fetch))
      .toEqual({ saved: 0, skipped: 0, failed: 1 });
    const hidden = vi.fn(async () => Response.json(body([{ channelId: id }])));
    expect(await collectChzzkFollowers({ sources: async () => [{ celebrity_id: "c", url }], save }, { clientId: "a", clientSecret: "b" }, hidden as unknown as typeof fetch))
      .toEqual({ saved: 0, skipped: 1, failed: 0 });
    expect(save).not.toHaveBeenCalled();
  });
});
