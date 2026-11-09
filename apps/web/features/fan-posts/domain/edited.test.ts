import { describe, expect, it } from "vitest";
import { isEdited } from "./edited";

const at = "2026-09-26T00:00:00Z";
describe("isEdited", () => {
  it("is false for a first save", () => expect(isEdited({ createdAt: at, updatedAt: at, revision: 1 })).toBe(false));
  it("is true once the revision passes 1", () => expect(isEdited({ createdAt: at, revision: 2 })).toBe(true));
  it("is true when the update time is later than the creation time", () => expect(isEdited({ createdAt: at, updatedAt: "2026-09-26T00:00:01Z" })).toBe(true));
  it("is false for a comment that carries only a first revision", () => expect(isEdited({ createdAt: at, revision: 1 })).toBe(false));
});
