import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { MobileSettingsRepository } from "./repository";
import { createMobileSettingsHandlers } from "./routes";

const owner = "11111111-1111-4111-8111-111111111111";
function setup() {
  const rpc = vi.fn(
    async (name: string): Promise<{ data: unknown; error: null }> => ({
      data:
        name === "mobile_disable_owned_installation"
          ? {
              installationId: owner,
              installationVersion: 3,
              linkVersion: 2,
              accountVersion: 1,
              status: "disabled",
              replayed: false,
            }
          : name === "mobile_get_owned_notification"
            ? { id: owner, target: { available: true, deepLink: "/my" } }
            : name === "mark_owned_web_notifications_read"
              ? true
              : { ok: true },
      error: null,
    }),
  );
  const repository = new MobileSettingsRepository({ rpc });
  return {
    rpc,
    handlers: createMobileSettingsHandlers({
      authorize: vi.fn(async () => ({
        appUserId: owner,
        privyUserId: "did:1",
        email: "a@b.co",
      })),
      repository,
    }),
  };
}
describe("mobile settings routes", () => {
  it("materializes owned intents before reading the inbox", async () => {
    const { rpc, handlers } = setup();
    await handlers.notifications(new Request("https://byus.kr/api/me/notifications"));
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["fan_web_drain_notification_intents", "mobile_get_owned_notifications"]);
    expect(rpc).toHaveBeenNthCalledWith(1, "fan_web_drain_notification_intents", { p_app_user_id: owner, p_limit: 100 });
  });
  it("materializes due notifications before claiming native pushes", async () => {
    const { rpc } = setup();
    await new MobileSettingsRepository({ rpc }).claimPush("native-worker", 20, 60);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(["enqueue_due_fan_notifications", "mobile_claim_push_deliveries"]);
  });
  it("does not claim native pushes when intent materialization fails", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "INTENT_FAILED" } }));
    await expect(new MobileSettingsRepository({ rpc }).claimPush("native-worker", 20, 60)).rejects.toThrow("INTENT_FAILED");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each(["activity", "relationships", "info", "community"])("forwards the allowlisted inbox filter %s", async (category) => {
    const { rpc, handlers } = setup();
    const response = await handlers.notifications(new Request(`https://byus.kr/api/me/notifications?category=${category}&locale=ja`));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mobile_get_owned_notifications", {
      p_app_user_id: owner, p_category: category, p_locale: "en", p_limit: 30,
      p_cursor_created_at: null, p_cursor_id: null,
    });
  });
  it("preserves the four independent source notification topics", async () => {
    const { rpc, handlers } = setup();
    const topics = { favoriteNews: false, social: true, activity: false, friendActivity: true };
    const response = await handlers.patchSettings(new Request("https://byus.kr/api/me/settings", {
      method: "PATCH", body: JSON.stringify({ expectedRevision: 2, topics }),
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mobile_patch_owned_settings", {
      p_app_user_id: owner, p_expected_revision: 2, p_patch: { topics },
    });
  });
  it("patches an allowlisted revisioned settings document", async () => {
    const { rpc, handlers } = setup();
    const response = await handlers.patchSettings(
      new Request("https://byus.kr/api/me/settings", {
        method: "PATCH",
        headers: { authorization: "Bearer t" },
        body: JSON.stringify({
          expectedRevision: 2,
          preferredLocale: "fr",
          topics: { benefit: false },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mobile_patch_owned_settings", {
      p_app_user_id: owner,
      p_expected_revision: 2,
      p_patch: { preferredLocale: "fr", topics: { benefit: false } },
    });
  });
  it("clears an optional region with an explicit null", async () => {
    const { rpc, handlers } = setup();
    const response = await handlers.patchSettings(
      new Request("https://byus.kr/api/me/settings", {
        method: "PATCH",
        headers: { authorization: "Bearer t" },
        body: JSON.stringify({ expectedRevision: 2, regionCode: null }),
      }),
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("mobile_patch_owned_settings", {
      p_app_user_id: owner,
      p_expected_revision: 2,
      p_patch: { regionCode: null },
    });
  });
  it("rejects malformed installation tokens before persistence", async () => {
    const { rpc, handlers } = setup();
    const response = await handlers.registerInstallation(
      new Request("https://byus.kr/api/me/installations", {
        method: "POST",
        headers: { authorization: "Bearer t" },
        body: JSON.stringify({
          installationId: owner,
          platform: "ios",
          permission: "authorized",
          appVersion: "1",
          locale: "ko",
          requestId: owner,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("registers an installation against its persisted version", async () => {
    const { rpc, handlers } = setup();
    const response = await handlers.registerInstallation(
      new Request("https://byus.kr/api/me/installations", {
        method: "POST",
        headers: { authorization: "Bearer t" },
        body: JSON.stringify({
          installationId: owner,
          expectedInstallationVersion: 0,
          platform: "ios",
          pushToken: "device-token",
          permission: "authorized",
          appVersion: "1",
          locale: "ko",
          requestId: owner,
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("mobile_register_owned_installation", {
      p_app_user_id: owner,
      p_installation_id: owner,
      p_platform: "ios",
      p_push_token: "device-token",
      p_permission: "authorized",
      p_app_version: "1",
      p_locale: "ko",
      p_expected_installation_version: 0,
      p_request_id: owner,
    });
  });
  it("recovers only the current version for a high-entropy installation id", async () => {
    const { rpc, handlers } = setup();
    rpc.mockResolvedValueOnce({
      data: { installationId: owner, installationVersion: 4 },
      error: null,
    });
    const response = await handlers.getInstallation(
      new Request(`https://byus.kr/api/me/installations/${owner}`, {
        headers: { authorization: "Bearer t" },
      }),
      owner,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      installation: { installationId: owner, installationVersion: 4 },
    });
    expect(rpc).toHaveBeenCalledWith("mobile_get_installation_version", {
      p_app_user_id: owner,
      p_installation_id: owner,
    });
  });
  it("unlinks an installation with revision and idempotency fences", async () => {
    const { rpc, handlers } = setup();
    const response = await handlers.disableInstallation(
      new Request(`https://byus.kr/api/me/installations/${owner}`, {
        method: "DELETE",
        headers: { authorization: "Bearer t" },
        body: JSON.stringify({
          expectedInstallationVersion: 2,
          requestId: owner,
        }),
      }),
      owner,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      installation: {
        installationId: owner,
        installationVersion: 3,
        linkVersion: 2,
        accountVersion: 1,
        status: "disabled",
      },
      replayed: false,
    });
    expect(rpc).toHaveBeenCalledWith("mobile_disable_owned_installation", {
      p_app_user_id: owner,
      p_installation_id: owner,
      p_expected_installation_version: 2,
      p_request_id: owner,
    });
  });
  it("requires a complete cursor pair", async () => {
    const { rpc, handlers } = setup();
    const response = await handlers.notifications(
      new Request(
        "https://byus.kr/api/me/notifications?cursorAt=2026-10-12T00:00:00Z",
        { headers: { authorization: "Bearer t" } },
      ),
    );
    expect(response.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("resolves one currently authorized notification target", async () => {
    const { rpc, handlers } = setup();
    const response = await handlers.notification(
      new Request(`https://byus.kr/api/me/notifications/${owner}?locale=fr`, {
        headers: { authorization: "Bearer t" },
      }),
      owner,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notification: { id: owner, target: { available: true, deepLink: "/my" } },
    });
    expect(rpc).toHaveBeenCalledWith("mobile_get_owned_notification", {
      p_app_user_id: owner,
      p_notification_id: owner,
      p_locale: "en",
    });
  });
  it("returns not found when a notification target is no longer authorized", async () => {
    const { rpc, handlers } = setup();
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const response = await handlers.notification(
      new Request(`https://byus.kr/api/me/notifications/${owner}`, {
        headers: { authorization: "Bearer t" },
      }),
      owner,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: "NOT_FOUND" } });
  });
  it("marks every owned notification read with the existing nullable RPC contract", async () => {
    const { rpc, handlers } = setup();
    const response = await handlers.markAllRead(
      new Request("https://byus.kr/api/me/notifications/read-all", {
        method: "POST",
        headers: { authorization: "Bearer t" },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ read: true });
    expect(rpc).toHaveBeenCalledWith("mark_owned_web_notifications_read", {
      p_app_user_id: owner,
      p_notification_id: null,
    });
  });
});
