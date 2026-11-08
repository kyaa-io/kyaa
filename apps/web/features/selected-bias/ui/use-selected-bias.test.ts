import { afterEach, describe, expect, it, vi } from "vitest";
import { pickSelectedBias, saveNamedFavorite, type SelectedBiasOption } from "./use-selected-bias";

const option = (slug: string) => ({ slug, tier: "Silver", stage: null }) as SelectedBiasOption;

describe("pickSelectedBias", () => {
  it("takes the stored choice while its passport exists", () => {
    expect(pickSelectedBias([option("a"), option("b")], "b")?.slug).toBe("b");
  });
  it("defaults to the same passport whatever order the locale sorted the list in", () => {
    expect(pickSelectedBias([option("a"), option("b")], null)?.slug).toBe("a");
    expect(pickSelectedBias([option("b"), option("a")], "gone")?.slug).toBe("a");
  });
  it("defaults to the highest stage, so ko and en headers show one favorite (261107-2 H-1)", () => {
    const diamond = { slug: "ranking", tier: "Diamond", stage: { key: "diamond-1", tier: "Diamond", subdivision: 1 } } as SelectedBiasOption;
    const silver = { slug: "p1", tier: "Silver", stage: { key: "silver-1", tier: "Silver", subdivision: 1 } } as SelectedBiasOption;
    const ko = pickSelectedBias([diamond, silver], null);
    const en = pickSelectedBias([silver, diamond], null);
    expect(ko?.slug).toBe("ranking");
    expect(en?.slug).toBe("ranking");
  });
  it("uses the only passport, and nothing without one", () => {
    expect(pickSelectedBias([option("a")], "gone")?.slug).toBe("a");
    expect(pickSelectedBias([], "a")).toBeNull();
  });
  it("takes the favorite named in MY first when it is one of the passports, else falls back (C1, D's fan_profile_public_fields)", () => {
    expect(pickSelectedBias([option("a"), option("b"), option("c")], "b", "c")?.slug).toBe("c");
    expect(pickSelectedBias([option("a"), option("b")], "b", "not-a-passport")?.slug).toBe("b");
    expect(pickSelectedBias([option("a"), option("b")], null, null)?.slug).toBe("a");
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
  it("does nothing before that route exists, when signed out, or when nothing changes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await saveNamedFavorite("b", "ko", token)).toBe(false);
    expect(await saveNamedFavorite("b", "ko", async () => null)).toBe(false);
    const fetcher = vi.fn(async () => Response.json({ favorite: { slug: "b", name: "B" }, links: [], bio: null }));
    vi.stubGlobal("fetch", fetcher);
    expect(await saveNamedFavorite("b", "ko", token)).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
