import { expect, it } from "vitest";
import { parseWaveMembers } from "./wave-friends";

const member = { profileId: "93000000-0000-4000-8000-000000000002", nickname: "WAVE participant", avatarUrl: "/images/avatars/star-pink.webp" };
it("parses the last member page and strips unrelated fields", () => {
  expect(parseWaveMembers({ members: [{ ...member, email: "private@example.test" }], nextCursor: null, nameEncrypted: "private" }))
    .toEqual({ members: [member], nextCursor: null });
});
it("bounds member pages and rejects unsafe avatars or invalid cursor contracts", () => {
  expect(() => parseWaveMembers({ members: Array.from({ length: 51 }, () => member), nextCursor: null })).toThrow();
  expect(() => parseWaveMembers({ members: [{ ...member, avatarUrl: "javascript:alert(1)" }], nextCursor: null })).toThrow();
  expect(() => parseWaveMembers({ members: [], nextCursor: "offset=10" })).toThrow();
  expect(() => parseWaveMembers({ members: [] })).toThrow();
});
