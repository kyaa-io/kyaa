import { afterEach, expect, it, vi } from "vitest";
import { signEmailUnsubscribeToken } from "../../../../../worker/src/email-unsubscribe";

const key = "ab".repeat(32);
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/notification/email-unsubscribe-dependencies", () => ({
  emailUnsubscribeDependencies: () => ({ keyHex: "ab".repeat(32), client: { rpc: mocks.rpc } }),
}));
import { GET, POST } from "./route";

const notificationId = "7b1f4f0e-2c1d-4a3b-9c5d-1e2f3a4b5c6d";
const token = () => signEmailUnsubscribeToken(key, { notificationId, templateKey: "survey_reminder" });
afterEach(() => vi.resetAllMocks());

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
  expect(mocks.rpc).toHaveBeenCalledWith("apply_email_unsubscribe", expect.objectContaining({ p_notification_id: notificationId, p_scope: "preference", p_preference: "survey_reminders", p_enabled: false }));
});

it("does not change anything on GET", async () => {
  const response = await GET(new Request(`https://kyaa.io/api/email/unsubscribe?t=${token()}`));
  expect(response.status).toBe(303);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
