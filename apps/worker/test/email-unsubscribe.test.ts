import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import { describe, expect, it, vi } from "vitest";
import { SesEmailSender, type SesV2SendClient } from "../src/adapters/ses-email-sender.js";
import { emailUnsubscribeHeaders, emailUnsubscribeLinks, signEmailUnsubscribeToken } from "../src/email-unsubscribe.js";
import { renderNotificationEmail } from "../src/email-template.js";
import type { ExternalNotificationJob } from "../src/external-notification-domain.js";

const key = "ab".repeat(32);
const notificationId = "7b1f4f0e-2c1d-4a3b-9c5d-1e2f3a4b5c6d";
const job: ExternalNotificationJob = {
  id: "delivery", notificationId, planId: "plan", channel: "email", sequence: 1,
  templateKey: "benefit_won", locale: "ko", destination: "fan@example.com",
  payload: { title: "당첨", detail: "확인해 주세요", deepLink: "/my" },
  attemptCount: 1, leaseOwner: "worker", leaseExpiresAt: "2099-01-01T00:00:00Z",
};

function decode(token: string) {
  const [version, payload] = token.split(".");
  return { version, claims: JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")) as { n: string; k: string; e: number } };
}

describe("signed mail unsubscribe links", () => {
  it("binds the link to one notification, its kind and an expiry", () => {
    const now = new Date("2026-11-15T00:00:00Z");
    const { version, claims } = decode(signEmailUnsubscribeToken(key, { notificationId, templateKey: "benefit_won", now }));
    expect(version).toBe("v1");
    expect(claims).toEqual({ n: notificationId, k: "benefit_won", e: Math.floor(now.getTime() / 1000) + 90 * 86400 });
  });

  it("is stable for the same input and changes with the key", () => {
    const input = { notificationId, templateKey: "benefit_won", now: new Date("2026-11-15T00:00:00Z") };
    expect(signEmailUnsubscribeToken(key, input)).toBe(signEmailUnsubscribeToken(key, input));
    expect(signEmailUnsubscribeToken("cd".repeat(32), input)).not.toBe(signEmailUnsubscribeToken(key, input));
  });

  it("refuses a malformed key", () => {
    expect(() => signEmailUnsubscribeToken("short", { notificationId, templateKey: "benefit_won" })).toThrow("EMAIL_UNSUBSCRIBE_KEY_INVALID");
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
      region: "ap-northeast-2", fromEmail: "notifications@kyaa.io", unsubscribeKey: key,
      now: () => new Date("2026-11-15T00:00:00Z"), client: { send },
      fetcher: vi.fn().mockResolvedValue(new Response(new Uint8Array([255, 216, 255, 224]), { headers: { "content-type": "image/jpeg" } })),
      ...extra,
    });
    return { send, sender };
  }

  it("signs this mail's own notification id and kind into the header and the footer", async () => {
    const { send, sender } = setup();
    await sender.send(job);
    const command = send.mock.calls[0]![0] as SendEmailCommand;
    const simple = command.input.Content!.Simple!;
    const header = simple.Headers!.find((h) => h.Name === "List-Unsubscribe")!.Value!;
    const token = new URL(header.slice(1, -1)).searchParams.get("t")!;
    expect(decode(token).claims).toMatchObject({ n: notificationId, k: "benefit_won" });
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

  it("will not start without a valid key", () => {
    expect(() => setup({ unsubscribeKey: "" })).toThrow();
    expect(() => setup({ unsubscribeOrigin: "http://kyaa.io" })).toThrow();
  });
});
