import { describe, expect, it } from "vitest";
import { completedStage, presentationFixture, stageFixture, tiktokFixture } from "../../../e2e/wave-stage-local/fixture";
import { parseStageHostEndpoint, stageHostProjectionSchema, stageHostSourceCommandSchema, toStageHostProjection } from "./stage-host-projection";

const input = { presentation: presentationFixture, tiktok: tiktokFixture, stage: completedStage(), scope: "all" as const, presentationFailed: false, tiktokFailed: false };
it("allowlists aggregate and published result fields even when raw objects contain sensitive extras", () => {
  const raw = structuredClone(input);
  for (const obj of [raw, raw.presentation, ...raw.presentation.creators, raw.presentation.onchain, raw.tiktok, ...raw.tiktok.creators, raw.stage, ...raw.stage.creators, ...raw.stage.prizes, raw.stage.draw, ...raw.stage.draw!.winners]) {
    Object.assign(obj!, { token: "SECRET", ownerId: "SECRET", userId: "SECRET", sessionStorage: "SECRET" });
  }
  const projection = toStageHostProjection(raw);
  expect(stageHostProjectionSchema.safeParse(projection).success).toBe(true);
  expect(projection.draw?.results.flatMap(p => p.winners)).toHaveLength(30);
  const json = JSON.stringify(projection);
  for (const forbidden of ["SECRET", "roomId", "benefitId", "campaignId", "eventKey", "liveSlug", "revision", "ownerId", "userId", "token", "sessionStorage"]) expect(json).not.toContain(forbidden);
  expect(projection.tiktok?.creators[1]?.viewers).toBeNull();
  expect(() => stageHostProjectionSchema.parse({ ...projection, token: "SECRET" })).toThrow();
});
it("does not invent winners or publish a pending draw", () => {
  expect(toStageHostProjection({ ...input, stage: stageFixture }).draw?.results).toEqual([]);
  const stage = completedStage(); Object.assign(stage.draw!, { publishedAt: null });
  expect(toStageHostProjection({ ...input, stage }).draw?.executedAt).toBeNull();
  expect(toStageHostProjection({ ...input, stage }).draw?.results).toEqual([]);
  expect(() => toStageHostProjection({ ...input, presentation: { ...presentationFixture, creators: [] } })).toThrow();
});
describe("source endpoint", () => {
  const endpoint = `ws://127.0.0.1:4173/source?token=${"a".repeat(64)}`;
  it("accepts only the exact loopback source endpoint with a 32-byte key", () => {
    expect(parseStageHostEndpoint(`#stage-host=${encodeURIComponent(endpoint)}`)).toBe(endpoint);
    for (const value of [endpoint.replace("127.0.0.1", "localhost"), endpoint.replace("127.0.0.1", "127.1"), endpoint.replace("127.0.0.1", "evil.test"), endpoint.replace("ws:", "wss:"), endpoint.replace(":4173", ":65536"), endpoint.replace("/source", "/other/../source"), endpoint + "&x=1", endpoint + "#x", endpoint.slice(0, -1), endpoint.replace("127.0.0.1", "user@127.0.0.1")]) expect(parseStageHostEndpoint(`#stage-host=${encodeURIComponent(value)}`)).toBeNull();
    expect(parseStageHostEndpoint("#stage-host=%broken")).toBeNull();
    expect(parseStageHostEndpoint("#other=value")).toBeNull();
  });
});
it("accepts scope/refresh only and rejects mutations, URLs and extra fields", () => {
  expect(stageHostSourceCommandSchema.safeParse({ type: "source-command", action: "scope", scope: "event-day" }).success).toBe(true);
  expect(stageHostSourceCommandSchema.safeParse({ type: "source-command", action: "refresh" }).success).toBe(true);
  for (const command of [{ action: "draw" }, { action: "execute" }, { action: "refresh", url: "https://evil.test" }, { action: "scope", scope: "other" }]) expect(stageHostSourceCommandSchema.safeParse({ type: "source-command", ...command }).success).toBe(false);
});
it('filters onsite admin winners strictly to the API-confirmed reveal cursor', () => {
  const onsite = { draw: { id: '11111111-1111-4111-8111-111111111111', executedAt: '2026-10-21T00:00:00Z', revealedThrough: 1 }, entryCount: 20,
    results: [{ prizeKey: 'tshirt' as const, winners: [{ nickname: 'PUBLIC', avatarUrl: "https://kyaa.io/avatar.png" }] }, { prizeKey: 'cap' as const, winners: [{ nickname: 'SECRET WINNER', avatarUrl: "https://kyaa.io/avatar.png" }] }] };
  const projection = toStageHostProjection({ ...input, onsite });
  expect(projection.onsite?.results).toHaveLength(1);
  expect(JSON.stringify(projection)).toContain('PUBLIC');
  expect(JSON.stringify(projection)).not.toContain('SECRET WINNER');
  expect(toStageHostProjection({ ...input, onsite: { ...onsite, draw: { ...onsite.draw, revealedThrough: 0 } } }).onsite?.results).toEqual([]);
});
