import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { processParticipationCompletions, type ParticipationCompletionRpc } from "./worker";

describe("mobile participation completion worker", () => {
  it("finishes only sessions returned by the atomic claim", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ items: [
        { sessionId: "11111111-1111-4111-8111-111111111111", version: 4 },
        { sessionId: "22222222-2222-4222-8222-222222222222", version: 7 },
      ] })
      .mockResolvedValue({ state: "completed" });
    const result = await processParticipationCompletions({ rpc } satisfies ParticipationCompletionRpc, 100);

    expect(result).toEqual({ claimed: 2, completed: 2 });
    expect(rpc).toHaveBeenNthCalledWith(1, "claim_mobile_participation_activity_completion", { p_limit: 50 });
    expect(rpc).toHaveBeenNthCalledWith(2, "finish_mobile_participation_activity_completion", {
      p_session_id: "11111111-1111-4111-8111-111111111111",
      p_expected_version: 4,
      p_accepted: true,
      p_rejection_code: null,
    });
  });
});
