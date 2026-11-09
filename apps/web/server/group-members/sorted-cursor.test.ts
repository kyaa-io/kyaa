import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { openFanCursor, sealFanCursor, type FanCursorScope } from "./sorted-cursor";

const secret = Buffer.alloc(32, 9).toString("base64");
const scope: FanCursorScope = { actor: null, page: "a9000000-0000-4000-8000-000000000002", mode: "members", search: "", locale: "ko" };
const position = { hearts: 2, stamps: 0, last_active_at: "2026-10-02T00:00:00Z", app_user_id: "a9000000-0000-4000-8000-000000000001" };
// Generated with the original ArrayBuffer key and fixed fixture IV 000102030405060708090a0b.
const legacyCursor = "AAECAwQFBgcICQoLfn6jzdTE3iTU4FA10MDcOcAMe8Rr9Cm2hP0PcFisTg6H0lrkPSvTPl9_-SvtgT9aUBkUOK_qAIIdLErEtR73iYtRam3_Yw9OWrqoTbGZINfzv3XroC9CHJzsomFLiK1jJASHwEj6H_zOlcM-skWaKawf0Q1TO6U9pCe2wCFPZ6xBPTwl";

describe("fan cursor encryption", () => {
  it("decrypts a cursor issued before the key type fix", () => {
    expect(openFanCursor(legacyCursor, scope, secret)).toEqual(position);
  });

  it("round-trips every cursor position field", () => {
    expect(openFanCursor(sealFanCursor(position, scope, secret), scope, secret)).toEqual(position);
  });

  it.each([
    { field: "IV", offset: 0 },
    { field: "authentication tag", offset: 12 },
    { field: "ciphertext", offset: 28 },
  ])("rejects a tampered $field", ({ offset }) => {
    const bytes = Buffer.from(legacyCursor, "base64url");
    bytes[offset] ^= 1;
    expect(() => openFanCursor(bytes.toString("base64url"), scope, secret)).toThrow(new SyntaxError("Invalid fan cursor"));
  });
});
