import { describe, expect, it } from "vitest";
import type { MySummary } from "@/features/my/domain/my-summary";
import { buildGuideViewer, parseSummary, pickGuideCreator } from "./use-guide-viewer";

const envelope = { summary: { profile: { nickname: null }, creators: [{ celebrity: { slug: "aespa", name: "aespa", image: "/a.png", isPublic: true }, relationship: "passport", passport: { id: "11111111-1111-4111-8111-111111111111", tier: "Bronze", score: 10, remainingToNextTier: 5 }, ticketBalance: 0, firstReaction: null }], live: { upcoming: [], history: [] }, rewards: { availableCount: 0, entries: 0, items: [] }, collection: { passportCount: 1, stampCount: 0, collectibleCount: 0, recent: [] }, unreadNotificationCount: 0 } };

describe("parseSummary", () => {
  it("unwraps the real { summary } envelope and reaches the creator", () => {
    expect(pickGuideCreator(parseSummary(envelope))).toEqual({ slug: "aespa", name: "aespa", passportId: "11111111-1111-4111-8111-111111111111" });
  });
  it("rejects a body without the envelope", () => {
    expect(() => parseSummary(envelope.summary)).toThrow();
    expect(() => parseSummary(null)).toThrow();
  });
});

const creator = (slug: string, passport: boolean) => ({ celebrity: { slug, name: slug.toUpperCase() }, passport: passport ? { id: `${slug}-pid` } : null });
const summary = (...items: ReturnType<typeof creator>[]) => ({ creators: items }) as unknown as MySummary;
const roadmap = { status: "ready", data: { pages: [{ filled: 6, slots: new Array(9).fill(null) }] } } as never;
const auth = { ready: true, authenticated: true };

describe("pickGuideCreator", () => {
  it("follows the selected favorite and defaults to the first passport like the header", () => {
    const several = summary(creator("a", false), creator("b", true), creator("c", true));
    expect(pickGuideCreator(several)).toEqual({ slug: "b", name: "B", passportId: "b-pid" });
    expect(pickGuideCreator(several, "c")).toEqual({ slug: "c", name: "C", passportId: "c-pid" });
    expect(pickGuideCreator(several, "a")).toEqual({ slug: "b", name: "B", passportId: "b-pid" });
    expect(pickGuideCreator(summary(creator("a", false), creator("b", true)))).toEqual({ slug: "b", name: "B", passportId: "b-pid" });
  });
  it("returns null with no passport or no summary", () => {
    expect(pickGuideCreator(summary(creator("a", false)))).toBeNull();
    expect(pickGuideCreator(summary())).toBeNull();
    expect(pickGuideCreator(undefined)).toBeNull();
  });
});

describe("buildGuideViewer", () => {
  const ready = (s: MySummary) => ({ status: "ready", data: s }) as never;
  it("loading until auth and summary are known", () => {
    expect(buildGuideViewer({ auth: { ready: false, authenticated: false }, summary: { status: "loading" }, roadmap: { status: "loading" } })).toEqual({ status: "loading" });
    expect(buildGuideViewer({ auth, summary: { status: "loading" }, roadmap: { status: "loading" } })).toEqual({ status: "loading" });
  });
  it("guest when signed out", () => {
    expect(buildGuideViewer({ auth: { ready: true, authenticated: false }, summary: { status: "loading" }, roadmap: { status: "loading" } })).toEqual({ status: "guest" });
  });
  it("member with a passport and progress", () => {
    expect(buildGuideViewer({ auth, summary: ready(summary(creator("a", true))), roadmap })).toEqual({ status: "member", creator: { slug: "a", name: "A", passportId: "a-pid" }, progress: { filled: 6, total: 9 } });
  });
  it("member without a passport is not unavailable", () => {
    const v = buildGuideViewer({ auth, summary: ready(summary(creator("a", false))), roadmap: { status: "loading" } });
    expect(v).toEqual({ status: "member", creator: null, progress: null });
  });
  it("partial holdings use the first passport creator", () => {
    const v = buildGuideViewer({ auth, summary: ready(summary(creator("a", false), creator("b", true))), roadmap });
    expect(v.status === "member" && v.creator?.slug).toBe("b");
  });
  it("roadmap error or null stage progress only hides progress", () => {
    const v = buildGuideViewer({ auth, summary: ready(summary(creator("a", true))), roadmap: { status: "error", kind: "network" } });
    expect(v).toEqual({ status: "member", creator: { slug: "a", name: "A", passportId: "a-pid" }, progress: null });
  });
  it("summary missing error is unavailable too, never no passport", () => {
    const retry = () => {};
    expect(buildGuideViewer({ auth, summary: { status: "error", kind: "missing" }, roadmap: { status: "loading" }, retry })).toEqual({ status: "member", creator: null, progress: null, unavailable: true, retry });
  });
  it("summary network error is unavailable, not no passport", () => {
    const retry = () => undefined;
    expect(buildGuideViewer({ auth, summary: { status: "error", kind: "network" }, roadmap: { status: "loading" }, retry })).toEqual({ status: "member", creator: null, progress: null, unavailable: true, retry });
  });
  it("summary auth error is a guest", () => {
    expect(buildGuideViewer({ auth, summary: { status: "error", kind: "auth" }, roadmap: { status: "loading" } })).toEqual({ status: "guest" });
  });
});
