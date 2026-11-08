import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultPassport, pickSelectedBias, saveNamedFavorite, type SelectedBiasOption } from "./use-selected-bias";

const option = (slug: string) => ({ slug, tier: "Silver", stage: null }) as SelectedBiasOption;

describe("pickSelectedBias", () => {
  it("is only the favorite named in MY, while its passport exists", () => {
    expect(pickSelectedBias([option("a"), option("b")], "b")?.slug).toBe("b");
    expect(pickSelectedBias([option("a"), option("b")], "not-a-passport")).toBeNull();
    expect(pickSelectedBias([option("a"), option("b")], null)).toBeNull();
  });
  it("opens the same default passport whatever order the locale sorted the list in, without calling it a favorite", () => {
    expect(defaultPassport([option("a"), option("b")])?.slug).toBe("a");
    expect(defaultPassport([option("b"), option("a")])?.slug).toBe("a");
    expect(defaultPassport([])).toBeNull();
  });
});

describe("saveNamedFavorite (header menu → MY favorite)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const token = async () => "t";
  it("keeps the SNS links and intro and changes only the favorite", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push([url, init]); return init?.method === "PUT" ? Response.json({}) : Response.json({ favorite: { slug: "a", name: "A" }, links: ["https://x.com/me"], bio: "hi", favoriteOptions: [] }); }));
    expect(await saveNamedFavorite("b", "ko", token)).toBe(true);
    expect(calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`)).toEqual(["GET /api/me/social/profile-fields?locale=ko", "PUT /api/me/social/profile-fields?locale=ko"]);
    expect(JSON.parse(String(calls[1]![1]!.body))).toEqual({ favoriteSlug: "b", links: ["https://x.com/me"], bio: "hi" });
  });
  it("fails before that route exists or when signed out, and writes nothing when the favorite is already named", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await saveNamedFavorite("b", "ko", token)).toBe(false);
    expect(await saveNamedFavorite("b", "ko", async () => null)).toBe(false);
    const fetcher = vi.fn(async () => Response.json({ favorite: { slug: "b", name: "B" }, links: [], bio: null }));
    vi.stubGlobal("fetch", fetcher);
    expect(await saveNamedFavorite("b", "ko", token)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
