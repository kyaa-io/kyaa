import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { deriveEmailUnsubscribeKey as deriveWorkerKey, emailUnsubscribeDestinationBinding, signEmailUnsubscribeToken } from "../../../worker/src/email-unsubscribe";
import { createEmailUnsubscribeGetHandler, createEmailUnsubscribePostHandler, type EmailUnsubscribeRouteDependencies } from "./email-unsubscribe-route";
import { applyEmailUnsubscribe, preferenceForMailKind, resolveEmailUnsubscribeTarget, unsubscribeEndsRequiredNotices } from "./email-unsubscribe";
import { deriveEmailUnsubscribeKey, verifyEmailUnsubscribeToken } from "./email-unsubscribe-token";

const secret = "p".repeat(48);
const key = deriveWorkerKey(secret);
const otherKey = deriveWorkerKey("q".repeat(48));
const mine = "7b1f4f0e-2c1d-4a3b-9c5d-1e2f3a4b5c6d";
const theirs = "9d2e5a61-3f4b-4c7d-8e9f-0a1b2c3d4e5f";
const issued = new Date("2026-11-15T00:00:00Z");
const address = "fan@example.com";
const token = (id = mine, templateKey = "benefit_won", now = issued) => signEmailUnsubscribeToken(key, { notificationId: id, templateKey, destination: address, now });
const binding = emailUnsubscribeDestinationBinding(mine, address);

function resign(payload: object, signingKey: Buffer = key) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", signingKey).update(`email-unsubscribe:v1.${body}`).digest("base64url");
  return `v1.${body}.${signature}`;
}

describe("link verification", () => {
  it("accepts a link the worker signed", () => {
    expect(verifyEmailUnsubscribeToken(key, token(), issued)).toMatchObject({ ok: true, notificationId: mine, templateKey: "benefit_won", destinationBinding: binding });
  });
  it("still accepts a link sent before the address binding, until it expires", () => {
    const old = resign({ n: mine, k: "benefit_won", e: Math.floor(issued.getTime() / 1000) + 86400 });
    expect(verifyEmailUnsubscribeToken(key, old, issued)).toMatchObject({ ok: true, notificationId: mine, destinationBinding: null });
    expect(verifyEmailUnsubscribeToken(key, old, new Date(issued.getTime() + 2 * 86400_000))).toEqual({ ok: false, reason: "expired" });
  });
  it("rejects a link whose address binding was edited or dropped", () => {
    const [v, payload, signature] = token().split(".");
    const claims = JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as Record<string, unknown>;
    const edit = (next: Record<string, unknown>) => `${v}.${Buffer.from(JSON.stringify(next)).toString("base64url")}.${signature}`;
    expect(verifyEmailUnsubscribeToken(key, edit({ ...claims, d: emailUnsubscribeDestinationBinding(mine, "new@example.com") }), issued)).toEqual({ ok: false, reason: "invalid" });
    const { d: _dropped, ...withoutBinding } = claims;
    expect(verifyEmailUnsubscribeToken(key, edit(withoutBinding), issued)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyEmailUnsubscribeToken(key, resign({ ...claims, d: "not-hex" }), issued).ok).toBe(false);
  });
  it("rejects a link signed with another key", () => {
    expect(verifyEmailUnsubscribeToken(otherKey, token(), issued)).toEqual({ ok: false, reason: "invalid" });
  });
  it("rejects a link whose notification id was swapped for another member's", () => {
    const [, , signature] = token().split(".");
    const forged = `v1.${Buffer.from(JSON.stringify({ n: theirs, k: "benefit_won", e: 9_999_999_999 })).toString("base64url")}.${signature}`;
    expect(verifyEmailUnsubscribeToken(key, forged, issued)).toEqual({ ok: false, reason: "invalid" });
  });
  it("rejects a link whose kind or expiry was edited", () => {
    const [v, , signature] = token().split(".");
    for (const claims of [{ n: mine, k: "level_up", e: 9_999_999_999 }, { n: mine, k: "benefit_won", e: 9_999_999_999 }]) {
      expect(verifyEmailUnsubscribeToken(key, `${v}.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.${signature}`, issued)).toEqual({ ok: false, reason: "invalid" });
    }
  });
  it("rejects a signed payload with the wrong shape", () => {
    expect(verifyEmailUnsubscribeToken(key, resign({ n: "not-a-uuid", k: "benefit_won", e: 9_999_999_999 }), issued).ok).toBe(false);
    expect(verifyEmailUnsubscribeToken(key, resign({ n: mine, k: "benefit_won", e: 9_999_999_999, x: 1 }), issued).ok).toBe(false);
  });
  it("rejects garbage", () => {
    for (const value of ["", "v1", "v1.a", "v2.a.b", "v1.a.b.c", "v1..", "x".repeat(2000)]) expect(verifyEmailUnsubscribeToken(key, value, issued).ok).toBe(false);
  });
  it("expires after 90 days and not before", () => {
    expect(verifyEmailUnsubscribeToken(key, token(), new Date(issued.getTime() + 89 * 86400_000)).ok).toBe(true);
    expect(verifyEmailUnsubscribeToken(key, token(), new Date(issued.getTime() + 91 * 86400_000))).toEqual({ ok: false, reason: "expired" });
  });
  it("derives the same key as the worker, and none from a missing or short secret", () => {
    expect(deriveEmailUnsubscribeKey(secret)!.toString("hex")).toBe(key.toString("hex"));
    expect(deriveEmailUnsubscribeKey(undefined)).toBeNull();
    expect(deriveEmailUnsubscribeKey("short")).toBeNull();
  });
  it("does not resolve a link without a key", () => {
    expect(resolveEmailUnsubscribeTarget(null, token(), issued)).toEqual({ state: "invalid" });
  });
});

describe("which switch a mail belongs to", () => {
  it("maps each member mail to the setting that controls it", () => {
    expect(preferenceForMailKind("live_10m")).toBe("live_reminders");
    expect(preferenceForMailKind("collectible_claim_expiring")).toBe("live_reminders");
    expect(preferenceForMailKind("survey_reminder")).toBe("survey_reminders");
    expect(preferenceForMailKind("benefit_won")).toBe("benefit_notifications");
    expect(preferenceForMailKind("runmusic_result")).toBe("benefit_notifications");
    expect(preferenceForMailKind("level_up")).toBeNull();
  });
  it("warns when the switch also carries win, pick-up or cancel notices, and always for all mail", () => {
    expect(unsubscribeEndsRequiredNotices("preference", "benefit_notifications")).toBe(true);
    expect(unsubscribeEndsRequiredNotices("preference", "live_reminders")).toBe(true);
    expect(unsubscribeEndsRequiredNotices("preference", "survey_reminders")).toBe(false);
    expect(unsubscribeEndsRequiredNotices("email", null)).toBe(true);
  });
  it("resolves a link into its target", () => {
    expect(resolveEmailUnsubscribeTarget(key, token(mine, "survey_reminder"), issued)).toEqual({ state: "ok", notificationId: mine, templateKey: "survey_reminder", destinationBinding: binding, preference: "survey_reminders" });
    expect(resolveEmailUnsubscribeTarget(null, token(), issued)).toEqual({ state: "invalid" });
    expect(resolveEmailUnsubscribeTarget(key, null, issued)).toEqual({ state: "invalid" });
  });
});

function clientReturning(error: { code?: string } | null = null) {
  return { rpc: vi.fn(async () => ({ data: {}, error })) };
}
const post = (url: string, body: Record<string, string>) => new Request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
function handler(client: ReturnType<typeof clientReturning> | null, overrides: Partial<EmailUnsubscribeRouteDependencies> = {}) {
  return createEmailUnsubscribePostHandler(() => ({ key, client, now: () => issued, ...overrides }));
}

describe("one-click POST (mail client)", () => {
  it("switches off the mail's own kind for the member named in the link", async () => {
    const client = clientReturning();
    const response = await handler(client)(post(`https://kyaa.io/api/email/unsubscribe?t=${token()}`, { "List-Unsubscribe": "One-Click" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, scope: "preference", enabled: false });
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith("apply_email_unsubscribe", { p_notification_id: mine, p_template_key: "benefit_won", p_scope: "preference", p_preference: "benefit_notifications", p_enabled: false, p_destination_binding: binding });
  });
  it("turns off all mail when the kind has no setting of its own", async () => {
    const client = clientReturning();
    const response = await handler(client)(post(`https://kyaa.io/api/email/unsubscribe?t=${token(mine, "level_up")}`, { "List-Unsubscribe": "One-Click" }));
    expect((await response.json())).toEqual({ ok: true, scope: "email", enabled: false });
    expect(client.rpc).toHaveBeenCalledWith("apply_email_unsubscribe", expect.objectContaining({ p_scope: "email", p_preference: null }));
  });
  it("changes nothing for a forged, other-key or expired link", async () => {
    const client = clientReturning();
    const run = (t: string) => handler(client)(post(`https://kyaa.io/api/email/unsubscribe?t=${t}`, { "List-Unsubscribe": "One-Click" }));
    expect((await run(`${token().slice(0, -3)}abc`)).status).toBe(400);
    expect((await run(signEmailUnsubscribeToken(otherKey, { notificationId: mine, templateKey: "benefit_won", destination: address, now: issued }))).status).toBe(400);
    expect((await run(signEmailUnsubscribeToken(key, { notificationId: mine, templateKey: "benefit_won", destination: address, now: new Date("2026-01-01T00:00:00Z") }))).status).toBe(410);
    expect((await run("")).status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("rejects a POST that is neither one-click nor the page form", async () => {
    const client = clientReturning();
    expect((await handler(client)(post(`https://kyaa.io/api/email/unsubscribe?t=${token()}`, { scope: "email" }))).status).toBe(400);
    expect((await handler(client)(post(`https://kyaa.io/api/email/unsubscribe?t=${token()}`, { scope: "everything", enabled: "false" }))).status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("answers like an expired link when the mail address changed since the mail was sent", async () => {
    const response = await handler(clientReturning({ code: "55000" }))(post(`https://kyaa.io/api/email/unsubscribe?t=${token()}`, { "List-Unsubscribe": "One-Click" }));
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: { code: "EXPIRED" } });
  });
  it("lets the database check a link sent before the address binding", async () => {
    const client = clientReturning();
    const old = resign({ n: mine, k: "benefit_won", e: 9_999_999_999 });
    expect((await handler(client)(post(`https://kyaa.io/api/email/unsubscribe?t=${old}`, { "List-Unsubscribe": "One-Click" }))).status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith("apply_email_unsubscribe", expect.objectContaining({ p_notification_id: mine, p_destination_binding: null }));
  });
  it("answers 404 when the notification no longer matches and 503 when the database fails", async () => {
    const url = `https://kyaa.io/api/email/unsubscribe?t=${token()}`;
    expect((await handler(clientReturning({ code: "P0002" }))(post(url, { "List-Unsubscribe": "One-Click" }))).status).toBe(404);
    expect((await handler(clientReturning({ code: "XX000" }))(post(url, { "List-Unsubscribe": "One-Click" }))).status).toBe(503);
    expect((await handler(null)(post(url, { "List-Unsubscribe": "One-Click" }))).status).toBe(503);
  });
  it("never answers with a cookie or a cacheable body", async () => {
    const response = await handler(clientReturning())(post(`https://kyaa.io/api/email/unsubscribe?t=${token()}`, { "List-Unsubscribe": "One-Click" }));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("page form POST", () => {
  it("applies the chosen scope and goes back to the page", async () => {
    const client = clientReturning();
    const response = await handler(client)(post(`https://kyaa.io/api/email/unsubscribe?t=${token()}&locale=ko`, { scope: "email", enabled: "false" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/email/unsubscribe?t=${encodeURIComponent(token())}&locale=ko&done=off-email`);
    expect(client.rpc).toHaveBeenCalledWith("apply_email_unsubscribe", expect.objectContaining({ p_scope: "email", p_enabled: false }));
  });
  it("turns it back on with the same link", async () => {
    const client = clientReturning();
    const response = await handler(client)(post(`https://kyaa.io/api/email/unsubscribe?t=${token()}`, { scope: "preference", enabled: "true" }));
    expect(response.headers.get("location")).toContain("done=on-preference");
    expect(client.rpc).toHaveBeenCalledWith("apply_email_unsubscribe", expect.objectContaining({ p_scope: "preference", p_enabled: true, p_preference: "benefit_notifications" }));
  });
  it("shows the expired page when the mail address changed", async () => {
    const response = await handler(clientReturning({ code: "55000" }))(post(`https://kyaa.io/api/email/unsubscribe?t=${token()}&locale=ko`, { scope: "email", enabled: "false" }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/email/unsubscribe?t=${encodeURIComponent(token())}&locale=ko&done=expired`);
  });
  it("sends a bad link back to the page without touching anything", async () => {
    const client = clientReturning();
    const response = await handler(client)(post(`https://kyaa.io/api/email/unsubscribe?t=${token().slice(0, -2)}xx`, { scope: "email", enabled: "false" }));
    expect(response.headers.get("location")).toContain("done=invalid");
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("refuses a setting the kind does not have", async () => {
    const client = clientReturning();
    const response = await handler(client)(post(`https://kyaa.io/api/email/unsubscribe?t=${token(mine, "level_up")}`, { scope: "preference", enabled: "false" }));
    expect(response.headers.get("location")).toContain("done=invalid");
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe("GET", () => {
  it("only redirects to the page and never changes anything", () => {
    const response = createEmailUnsubscribeGetHandler()(new Request(`https://kyaa.io/api/email/unsubscribe?t=${token()}`));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/email/unsubscribe?t=${encodeURIComponent(token())}`);
  });
});

describe("rpc wrapper", () => {
  it("does not call the database for a setting the kind lacks", async () => {
    const client = clientReturning();
    expect(await applyEmailUnsubscribe(client, { state: "ok", notificationId: mine, templateKey: "level_up", destinationBinding: binding, preference: null }, { scope: "preference", enabled: false })).toBe("not_found");
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
