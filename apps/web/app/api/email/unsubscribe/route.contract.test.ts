import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deriveEmailUnsubscribeKey, signEmailUnsubscribeToken } from "../../../../../worker/src/email-unsubscribe";

const key = deriveEmailUnsubscribeKey("p".repeat(48));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), key: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/notification/email-unsubscribe-dependencies", () => ({
  emailUnsubscribeDependencies: () => ({ key: mocks.key(), client: { rpc: mocks.rpc } }),
}));
import { GET, POST } from "./route";

const notificationId = "7b1f4f0e-2c1d-4a3b-9c5d-1e2f3a4b5c6d";
const token = () => signEmailUnsubscribeToken(key, { notificationId, templateKey: "survey_reminder", destination: "fan@example.com" });
afterEach(() => vi.resetAllMocks());
beforeEach(() => mocks.key.mockReturnValue(key));

it("exports only the verbs the mail client and the page use", async () => {
  const route = await import("./route");
  expect(Object.keys(route).filter((name) => ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(name)).sort()).toEqual(["GET", "POST"]);
});

it("answers a mail client's one-click POST without a login", async () => {
  mocks.rpc.mockResolvedValue({ data: {}, error: null });
  const response = await POST(new Request(`https://kyaa.io/api/email/unsubscribe?t=${token()}`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click",
  }));
  expect(response.status).toBe(200);
  expect(mocks.rpc).toHaveBeenCalledWith("apply_email_unsubscribe", expect.objectContaining({ p_notification_id: notificationId, p_scope: "activity", p_preference: null, p_enabled: false }));
});

it("does not change anything on GET", async () => {
  const response = await GET(new Request(`https://kyaa.io/api/email/unsubscribe?t=${token()}`));
  expect(response.status).toBe(303);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("changes nothing and answers 400 when the server has no signing secret", async () => {
  mocks.key.mockReturnValue(null);
  const response = await POST(new Request(`https://kyaa.io/api/email/unsubscribe?t=${token()}`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click",
  }));
  expect(response.status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
