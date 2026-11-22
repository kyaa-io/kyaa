import { describe, expect, it, vi } from "vitest";
import { renderChannelOperatorInvitationEmail, sendChannelOperatorInvitationOnce, type ChannelOperatorInvitationJob } from "../src/channel-operator-invitation-email.js";

const job: ChannelOperatorInvitationJob = {
  id: "70000000-0000-4000-8000-000000000001",
  email: "new.person@example.test",
  locale: "ko",
  origin: "https://dev.kyaa.io",
  expiresAt: "2026-12-06T05:00:00+00:00",
  channelName: "<앙상블> & 패치워크",
};

describe("operator invitation mail", () => {
  it("renders Korean then English with an untracked sign-in link and the kyaa footer", () => {
    const mail = renderChannelOperatorInvitationEmail(job);
    expect(mail.subject).toBe("[kyaa] <앙상블> & 패치워크 페이지 운영자 초대");
    expect(mail.text.indexOf("페이지 운영자 초대")).toBeLessThan(mail.text.indexOf("Invitation to manage"));
    expect(mail.text).toContain("https://dev.kyaa.io/login?locale=ko");
    expect(mail.text).toContain("https://dev.kyaa.io/login?locale=en");
    expect(mail.text).toContain("2026년 12월 6일까지");
    expect(mail.text).toContain("December 6, 2026");
    expect(mail.html).toContain("&lt;앙상블&gt; &amp; 패치워크");
    expect(mail.html).not.toContain("<앙상블>");
    // The sign-in link carries no UTM and opts out of click tracking; only the footer home link is tagged.
    const signIn = mail.html.match(/<a data-outbound-tracking="off"[^>]*href="([^"]+)"/g) ?? [];
    expect(signIn).toHaveLength(2);
    for (const anchor of signIn) expect(anchor).not.toContain("utm_");
    expect(mail.text).toContain("럭키드로우");
    expect(mail.text).toContain("kyaa 바로가기");
    expect(mail.text).toContain("@kyaa_app");
    expect(mail.text).toContain("utm_campaign=operator_invitation");
    expect(mail.text).not.toMatch(/token/i);
  });

  it("puts English first for an English invitation", () => {
    const mail = renderChannelOperatorInvitationEmail({ ...job, locale: "en" });
    expect(mail.subject).toBe("[kyaa] Invitation to manage <앙상블> & 패치워크");
    expect(mail.text).toContain("Visit kyaa");
  });
});

describe("operator invitation queue", () => {
  const db = (claim: unknown) => ({ rpc: vi.fn(async (name: string) => name === "claim_channel_operator_invitation_email" ? { data: claim, error: null } : { data: true, error: null }) });

  it("sends a claimed job once and records the message id", async () => {
    const client = { send: vi.fn(async () => ({ MessageId: "ses-1" })) };
    const rpc = db(job);
    expect(await sendChannelOperatorInvitationOnce(rpc, "https://dev.kyaa.io", "notifications@kyaa.io", client)).toBe(1);
    expect(rpc.rpc).toHaveBeenCalledWith("claim_channel_operator_invitation_email", { p_origin: "https://dev.kyaa.io" });
    expect(client.send).toHaveBeenCalledOnce();
    expect((client.send.mock.calls[0] as unknown as [{ input: { Destination: unknown } }])[0].input.Destination).toEqual({ ToAddresses: ["new.person@example.test"] });
    expect(rpc.rpc).toHaveBeenLastCalledWith("finish_channel_operator_invitation_email", { p_id: job.id, p_outcome: "sent", p_provider_id: "ses-1" });
  });

  it("does nothing on an empty queue", async () => {
    const client = { send: vi.fn() };
    expect(await sendChannelOperatorInvitationOnce(db(null), "https://dev.kyaa.io", "notifications@kyaa.io", client)).toBe(0);
    expect(client.send).not.toHaveBeenCalled();
  });

  it("closes a provider failure or a job of another environment as failed without retry", async () => {
    const failing = { send: vi.fn(async () => { throw new Error("throttled"); }) };
    const rpc = db(job);
    await expect(sendChannelOperatorInvitationOnce(rpc, "https://dev.kyaa.io", "notifications@kyaa.io", failing)).rejects.toThrow("OPERATOR_INVITATION_SEND_FAILED");
    expect(rpc.rpc).toHaveBeenLastCalledWith("finish_channel_operator_invitation_email", { p_id: job.id, p_outcome: "failed" });
    const client = { send: vi.fn() };
    const other = db({ ...job, origin: "https://kyaa.io" });
    await expect(sendChannelOperatorInvitationOnce(other, "https://dev.kyaa.io", "notifications@kyaa.io", client)).rejects.toThrow("OPERATOR_INVITATION_JOB_INVALID");
    expect(client.send).not.toHaveBeenCalled();
    expect(other.rpc).toHaveBeenLastCalledWith("finish_channel_operator_invitation_email", { p_id: job.id, p_outcome: "failed" });
  });
});
