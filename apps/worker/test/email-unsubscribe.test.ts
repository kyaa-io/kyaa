import { createHash } from "node:crypto";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { describe, expect, it, vi } from "vitest";
import { SesEmailSender, type SesV2SendClient } from "../src/adapters/ses-email-sender.js";
import { deriveEmailUnsubscribeKey, emailUnsubscribeDestinationBinding, emailUnsubscribeHeaders, emailUnsubscribeKeyTag, emailUnsubscribeLinks, signEmailUnsubscribeToken } from "../src/email-unsubscribe.js";
import { renderNotificationEmail } from "../src/email-template.js";
import type { ExternalNotificationJob } from "../src/external-notification-domain.js";

const secret = "s".repeat(48);
const key = deriveEmailUnsubscribeKey(secret);
const notificationId = "7b1f4f0e-2c1d-4a3b-9c5d-1e2f3a4b5c6d";
const job: ExternalNotificationJob = {
  id: "delivery", notificationId, planId: "plan", channel: "email", sequence: 1,
  templateKey: "benefit_won", locale: "ko", destination: "fan@example.com",
  payload: { priority: 3, title: "당첨", detail: "확인해 주세요", deepLink: "/my" },
  attemptCount: 1, leaseOwner: "worker", leaseExpiresAt: "2099-01-01T00:00:00Z",
};

function decode(token: string) {
  const [version, payload] = token.split(".");
  return { version, claims: JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as { n: string; k: string; d: string; e: number } };
}

describe("signed mail unsubscribe links", () => {
  it("binds the link to one notification, its kind, the send address and an expiry", () => {
    const now = new Date("2026-11-15T00:00:00Z");
    const { version, claims } = decode(signEmailUnsubscribeToken(key, { notificationId, templateKey: "benefit_won", destination: "fan@example.com", now }));
    expect(version).toBe("v1");
    expect(claims).toEqual({ n: notificationId, k: "benefit_won", d: emailUnsubscribeDestinationBinding(notificationId, "fan@example.com"), e: Math.floor(now.getTime() / 1000) + 90 * 86400 });
  });

  it("binds the address without putting it, or its plain fingerprint, in the link", () => {
    const fingerprint = createHash("sha256").update("fan@example.com").digest("hex");
    // Same vector as public.email_unsubscribe_destination_binding in supabase/tests/email_unsubscribe.sql.
    expect(emailUnsubscribeDestinationBinding(notificationId, "Fan@Example.com ")).toBe(
      createHash("sha256").update(`email-unsubscribe-destination:v1:${notificationId}:${fingerprint}`).digest("hex"),
    );
    const token = signEmailUnsubscribeToken(key, { notificationId, templateKey: "benefit_won", destination: "fan@example.com" });
    const text = Buffer.from(token.split(".")[1]!, "base64url").toString("utf8");
    expect(text).not.toContain("fan@");
    expect(text).not.toContain(fingerprint);
    expect(emailUnsubscribeDestinationBinding(notificationId, "other@example.com")).not.toBe(emailUnsubscribeDestinationBinding(notificationId, "fan@example.com"));
    expect(emailUnsubscribeDestinationBinding("9d2e5a61-3f4b-4c7d-8e9f-0a1b2c3d4e5f", "fan@example.com")).not.toBe(emailUnsubscribeDestinationBinding(notificationId, "fan@example.com"));
  });

  it("is stable for the same input and changes with the key", () => {
    const input = { notificationId, templateKey: "benefit_won", destination: "fan@example.com", now: new Date("2026-11-15T00:00:00Z") };
    expect(signEmailUnsubscribeToken(key, input)).toBe(signEmailUnsubscribeToken(key, input));
    expect(signEmailUnsubscribeToken(deriveEmailUnsubscribeKey("t".repeat(48)), input)).not.toBe(signEmailUnsubscribeToken(key, input));
  });

  it("derives a 32-byte key from the secret with a fixed HKDF vector", () => {
    expect(key.length).toBe(32);
    expect(key.toString("hex")).toBe(deriveEmailUnsubscribeKey(secret).toString("hex"));
    expect(emailUnsubscribeKeyTag(key)).toMatch(/^[0-9a-f]{8}$/);
    expect(emailUnsubscribeKeyTag(key)).not.toBe(emailUnsubscribeKeyTag(deriveEmailUnsubscribeKey("t".repeat(48))));
  });
  it("refuses a missing or short secret", () => {
    expect(() => deriveEmailUnsubscribeKey(undefined)).toThrow("EMAIL_UNSUBSCRIBE_SECRET_MISSING");
    expect(() => deriveEmailUnsubscribeKey("short")).toThrow("EMAIL_UNSUBSCRIBE_SECRET_MISSING");
  });

  it("builds the page link, the one-click link and both RFC 8058 headers", () => {
    const links = emailUnsubscribeLinks("https://kyaa.io", "v1.a.b", "ko");
    expect(links).toEqual({ pageUrl: "https://kyaa.io/email/unsubscribe?t=v1.a.b&locale=ko", oneClickUrl: "https://kyaa.io/api/email/unsubscribe?t=v1.a.b" });
    expect(emailUnsubscribeHeaders(links)).toEqual([
      { Name: "List-Unsubscribe", Value: "<https://kyaa.io/api/email/unsubscribe?t=v1.a.b>" },
      { Name: "List-Unsubscribe-Post", Value: "List-Unsubscribe=One-Click" },
    ]);
  });
});

describe("mail footer link", () => {
  const base = { title: "x", detail: "y", deepLink: "https://kyaa.io/my", templateKey: "benefit_won", locale: "ko" as const };
  it("adds the unsubscribe link to the HTML and the text part", () => {
    const mail = renderNotificationEmail({ ...base, unsubscribeUrl: "https://kyaa.io/email/unsubscribe?t=v1.a.b&locale=ko" });
    expect(mail.html).toContain('href="https://kyaa.io/email/unsubscribe?t=v1.a.b&amp;locale=ko"');
    expect(mail.html).toContain("이 메일 그만 받기");
    expect(mail.text).toContain("이 메일 그만 받기: https://kyaa.io/email/unsubscribe?t=v1.a.b&locale=ko");
  });
  it("keeps the settings link and omits the unsubscribe line when no link is given", () => {
    const mail = renderNotificationEmail(base);
    expect(mail.html).toContain("https://kyaa.io/settings?locale=ko");
    expect(mail.html).not.toContain("이 메일 그만 받기");
  });
  it("labels the link in English for English members", () => {
    expect(renderNotificationEmail({ ...base, locale: "en", unsubscribeUrl: "https://kyaa.io/email/unsubscribe?t=v1.a.b&locale=en" }).html).toContain("Stop receiving these emails");
  });
});

describe("SES sender unsubscribe headers", () => {
  function setup(extra: Partial<ConstructorParameters<typeof SesEmailSender>[0]> = {}) {
    const send = vi.fn<SesV2SendClient["send"]>().mockResolvedValue({ MessageId: "id" });
    const sender = new SesEmailSender({
      region: "ap-northeast-2", fromEmail: "notifications@kyaa.io", unsubscribeSecret: secret,
      now: () => new Date("2026-11-15T00:00:00Z"), client: { send },
      fetcher: vi.fn().mockResolvedValue(new Response(new Uint8Array([255, 216, 255, 224]), { headers: { "content-type": "image/jpeg" } })),
      ...extra,
    });
    return { send, sender };
  }

  it("signs this mail's own notification id, kind and address into the header and the footer", async () => {
    const { send, sender } = setup();
    await sender.send(job);
    const command = send.mock.calls[0]![0] as SendEmailCommand;
    const simple = command.input.Content!.Simple!;
    const header = simple.Headers!.find((h) => h.Name === "List-Unsubscribe")!.Value!;
    const token = new URL(header.slice(1, -1)).searchParams.get("t")!;
    expect(decode(token).claims).toMatchObject({ n: notificationId, k: "benefit_won", d: emailUnsubscribeDestinationBinding(notificationId, "fan@example.com") });
    expect(simple.Headers!.find((h) => h.Name === "List-Unsubscribe-Post")!.Value).toBe("List-Unsubscribe=One-Click");
    expect(simple.Body!.Html!.Data).toContain(`/email/unsubscribe?t=${encodeURIComponent(token)}&amp;locale=ko`);
    expect(simple.Body!.Text!.Data).toContain("이 메일 그만 받기");
  });

  it("points a dev worker at the dev site", async () => {
    const { send, sender } = setup({ unsubscribeOrigin: "https://dev.kyaa.io" });
    await sender.send(job);
    const header = (send.mock.calls[0]![0] as SendEmailCommand).input.Content!.Simple!.Headers![0]!.Value!;
    expect(header.startsWith("<https://dev.kyaa.io/api/email/unsubscribe?t=")).toBe(true);
  });

  it("still sends the mail, without the link, when there is no secret, and logs the error", async () => {
    const logError = vi.fn();
    const { send, sender } = setup({ unsubscribeSecret: undefined, logError });
    await expect(sender.send(job)).resolves.toEqual({ providerMessageId: "id" });
    const simple = (send.mock.calls[0]![0] as SendEmailCommand).input.Content!.Simple!;
    expect(simple.Headers).toBeUndefined();
    expect(simple.Body!.Html!.Data).not.toContain("이 메일 그만 받기");
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("EMAIL_UNSUBSCRIBE_UNAVAILABLE"));
  });

  it("still sends when signing fails at send time", async () => {
    const logError = vi.fn();
    const { send, sender } = setup({ logError, now: () => { throw new Error("clock"); } });
    await expect(sender.send(job)).resolves.toEqual({ providerMessageId: "id" });
    expect((send.mock.calls[0]![0] as SendEmailCommand).input.Content!.Simple!.Headers).toBeUndefined();
    expect(logError).toHaveBeenCalledWith(expect.stringContaining("EMAIL_UNSUBSCRIBE_SIGN_FAILED"));
  });

  it("will not start with an insecure link origin", () => {
    expect(() => setup({ unsubscribeOrigin: "http://kyaa.io" })).toThrow();
  });
});
