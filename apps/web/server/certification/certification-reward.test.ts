import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { CertificationRepository } from "./certification-repository";
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const submission = { id, missionId: owner, title: "Proof", status: "approved", attemptNumber: 1, note: null, rejectionReason: null, revision: 2, submittedAt: "2026-10-15T00:00:00Z", reviewedAt: "2026-10-15T01:00:00Z", reward: { scorePoints: 1, ticketAmount: 0, stampCount: 1 }, uploads: [] };
describe("certification reward read", () => {
  it("keeps legacy shape and avoids an additional receipt read", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: submission, error: null });
    expect(await new CertificationRepository({ rpc } as never).getSubmission(owner, id, "ko")).toEqual(submission);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("reads original submission source and keeps XP, stamps and genuine tickets separate", async () => {
    const fanReward = { status: "awarded", asset: "fan_point", amount: 20, policyVersion: "v1", sourceId: id, ledgerId: owner };
    const rpc = vi.fn().mockResolvedValueOnce({ data: submission, error: null }).mockResolvedValueOnce({ data: fanReward, error: null });
    const result = await new CertificationRepository({ rpc } as never).getSubmission(owner, id, "ko", true);
    expect(result).toEqual({ ...submission, fanReward });
    expect(rpc).toHaveBeenLastCalledWith("read_owned_mobile_fan_reward", { p_app_user_id: owner, p_source_id: id });
  });
});
