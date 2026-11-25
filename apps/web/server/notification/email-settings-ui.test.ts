import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseNotificationConnections } from "../../features/notification/domain/connected-account";
import { notificationItemSchema, notificationPreferencesSchema } from "../../features/notification/domain/notification-model";
import { emailSettingsCopy } from "../../features/notification/email-settings-copy";
import { createPatchPreferencesHandler } from "./notification-route";
import { projectNotificationRow } from "./notification-repository";

const channel = { id: "40000000-0000-4000-8000-000000000001", kind: "email", status: "eligible", consented: true, destinationLabel: "f***@example.com", verifiedAt: "2026-09-04T00:00:00.000Z" };
const base = { id: "11111111-1111-4111-8111-111111111111", created_at: "2026-11-16T00:00:00.000Z", read_at: null, live_events: null, deep_link: "/settings" };

describe("EMAIL-UI-1116 mail delivery state in settings", () => {
  it("reads the delivery state of the mail channel and treats a missing one as normal", () => {
    const parse = (extra: object) => parseNotificationConnections({ accounts: [], channels: [{ ...channel, ...extra }] }).channels[0];
    expect(parse({}).deliveryState).toBeUndefined();
    expect(parse({ deliveryState: null }).deliveryState).toBeNull();
    for (const state of ["soft_paused", "bounced", "complained"]) expect(parse({ deliveryState: state }).deliveryState).toBe(state);
    expect(() => parse({ deliveryState: "ok" })).toThrow();
  });
  it("has one line per stopped state in Korean and English, and falls back to English", () => {
    for (const locale of ["ko", "en"] as const) expect(Object.values(emailSettingsCopy(locale).blocked).every((line) => line.length > 0)).toBe(true);
    expect(emailSettingsCopy("ko").blocked.bounced).toBe("메일이 되돌아와 멈췄어요");
    expect(emailSettingsCopy("fr")).toBe(emailSettingsCopy("en"));
  });
  it("shows the site notice with the masked address and links to settings", () => {
    const row = (state: string, payload: object = { destinationLabel: "f***@example.com" }) => projectNotificationRow({ ...base, kind: "email_delivery_blocked", payload: { schemaVersion: 1, state, ...payload } }, "ko");
    expect(notificationItemSchema.parse(row("bounced"))).toMatchObject({ kind: "email_delivery_blocked", title: "메일이 되돌아왔어요", detail: "f***@example.com로 보낸 메일이 되돌아와 보내기를 멈췄어요.", deepLink: "/settings" });
    expect(row("soft_paused").title).toBe("메일 보내기를 잠시 멈췄어요");
    expect(row("complained").detail).toContain("스팸으로 신고");
    expect(projectNotificationRow({ ...base, kind: "email_delivery_blocked", payload: { state: "bounced", destinationLabel: "f***@example.com" } }, "en").detail).toBe("Email to f***@example.com bounced, so we stopped sending.");
    expect(row("bounced", { destinationLabel: "  " }).detail).toContain("메일 주소");
  });
  it("does not let the settings link carry a query or another path", () => {
    expect(notificationItemSchema.safeParse({ ...projectNotificationRow({ ...base, kind: "email_delivery_blocked", payload: { state: "bounced" }, deep_link: "/settings?x=1" }, "ko") }).success).toBe(false);
  });
});

describe("EMAIL-UI-1116 three more notification switches", () => {
  it("defaults the three switches to on", () => {
    expect(notificationPreferencesSchema.parse({ liveReminders: true, surveyReminders: true, benefitNotifications: true, browserSubscription: "unsubscribed" }))
      .toMatchObject({ marketingNotifications: false, socialNotifications: true, friendActivityNotifications: true, participationNotifications: true });
  });
  it("passes each switch to the repository and rejects an unknown or non-boolean one", async () => {
    const patchPreferences = vi.fn(async () => ({}));
    const deps = { authorize: vi.fn(async () => ({ appUserId: "11111111-1111-4111-8111-111111111111" })), repository: { patchPreferences } } as never;
    const call = (body: object) => createPatchPreferencesHandler(deps)(new Request("https://byus.example", { method: "PATCH", headers: { authorization: "Bearer t", "content-type": "application/json" }, body: JSON.stringify(body) }));
    for (const key of ["socialNotifications", "friendActivityNotifications", "participationNotifications"]) {
      expect((await call({ [key]: false })).status).toBe(200);
      expect(patchPreferences).toHaveBeenLastCalledWith({ appUserId: "11111111-1111-4111-8111-111111111111", [key]: false });
    }
    expect((await call({ marketingNotifications: true })).status).toBe(200);
    expect((await call({ unknownPreference: true })).status).toBe(400);
    expect((await call({ socialNotifications: "no" })).status).toBe(400);
  });
});

describe("EMAIL-UI-1116 migration", () => {
  const sql = readFileSync(resolve(__dirname, "../../../../supabase/migrations/20261228120000_email_settings_ui.sql"), "utf8");
  it("reports a stop only for the current address and while the pause lasts, and leaves marketing out of the patch", () => {
    expect(sql).toContain("h.destination_fingerprint=c.destination_fingerprint");
    expect(sql).toContain("h.state='soft_paused' and h.paused_until>pg_catalog.now()");
    expect(sql).toContain("'social_notifications','friend_activity_notifications','participation_notifications'");
    expect(sql).not.toContain("marketing_notifications");
  });
});
