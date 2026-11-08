import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/dukjil/creator-id", () => ({ resolveCreatorId: vi.fn() }));
vi.mock("@/server/fanpage/dependencies", () => ({ createFanpageDependencies: vi.fn() }));
import { readJjinfanSeed, readSharedJjinfanChallenge } from "./jjinfan-share";

const ID = "22222222-2222-4222-8222-222222222222";
const deps = (answer: unknown, id: string | null = ID) => ({ resolveCreatorId: vi.fn(async () => id), rpc: vi.fn(async () => answer) });

describe("shared jjinfan challenge", () => {
  it("answers the live gauge only while the challenge is on", async () => {
    const on = deps({ count: 47, target: 100, campaign: { title: "찐팬 100명", description: "" } });
    expect(await readSharedJjinfanChallenge("elina", on)).toEqual({ count: 47, target: 100, campaign: { title: "찐팬 100명", description: "" } });
    expect(on.rpc).toHaveBeenCalledWith("read_jjinfan_challenge", { p_celebrity: ID });
    expect(await readSharedJjinfanChallenge("elina", deps({ count: 47, target: 100, campaign: null }))).toBeNull();
    expect(await readSharedJjinfanChallenge("elina", deps({ count: 47, target: 100 }))).toBeNull();
  });
  it("does not read the database for a bad slug or an unknown creator", async () => {
    const bad = deps({});
    expect(await readSharedJjinfanChallenge("Bad Slug", bad)).toBeNull();
    expect(bad.resolveCreatorId).not.toHaveBeenCalled();
    const unknown = deps({}, null);
    expect(await readSharedJjinfanChallenge("nobody", unknown)).toBeNull();
    expect(unknown.rpc).not.toHaveBeenCalled();
  });
});

describe("jjinfan seed for the fan page's first paint", () => {
  it("answers the gauge as read, off included, and undefined when it cannot read", async () => {
    expect(await readJjinfanSeed("elina", deps({ count: 3, target: 100, campaign: null }))).toEqual({ count: 3, target: 100, campaign: null });
    expect(await readJjinfanSeed("elina", { resolveCreatorId: vi.fn(async () => ID), rpc: vi.fn(async () => { throw new Error("db"); }) })).toBeUndefined();
    expect(await readJjinfanSeed("Bad Slug", deps({}))).toBeUndefined();
    expect(await readJjinfanSeed("nobody", deps({}, null))).toBeUndefined();
  });
});
