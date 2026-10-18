import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createWaveRepository } from "./wave-repository";
const input = { name: "Name", email: "person@example.com", message: "Hello", interest: "partnership" as const, locale: "en" as const, website: "" as const, requestId: "11111111-1111-4111-8111-111111111111", consent: true as const, sessionId: "22222222-2222-4222-8222-222222222222", channel: "direct" as const };
it("only forwards the atomic wave contract, never client company or raw session", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
  expect(await createWaveRepository({ rpc }).submit(input, "ip", "payload", "session")).toBe(false);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("submit_wave_inquiry", { p_id: input.requestId, p_locale: "en", p_name: "Name", p_email: input.email, p_message: "Hello", p_consent: true, p_ip_hash: "ip", p_payload_hash: "payload", p_inquiry_type: "wave_partner", p_session_hash: "session", p_channel: "direct" });
});
it("maps safe SQL errors and masks unknown database outcomes", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "INQUIRY_RATE_LIMITED" } });
  const repo = createWaveRepository({ rpc });
  await expect(repo.submit(input, "ip", "payload", "session")).rejects.toMatchObject({ code: "INQUIRY_RATE_LIMITED" });
  rpc.mockResolvedValue({ data: null, error: { message: "secret" } });
  await expect(repo.submit(input, "ip", "payload", "session")).rejects.toMatchObject({ code: "INQUIRY_UNAVAILABLE" });
  rpc.mockResolvedValue({ data: null, error: null });
  await expect(repo.submit(input, "ip", "payload", "session")).rejects.toMatchObject({ code: "INQUIRY_UNAVAILABLE" });
});
it("forwards only whitelisted client event fields and hashed identifiers", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
  const event = { event: "page_view" as const, requestId: input.requestId, sessionId: input.sessionId, channel: input.channel, locale: input.locale };
  expect(await createWaveRepository({ rpc }).engage(event, "ip", "session")).toBe(true);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("record_wave_engagement", { p_event: "page_view", p_id: input.requestId, p_session_hash: "session", p_ip_hash: "ip", p_channel: "direct", p_locale: "en" });
});
