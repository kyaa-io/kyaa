import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "k" }) }));
const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/server/data/client", () => ({ createClient: () => ({ rpc, from }) }));
import { kstMonthStart, readProofMissions } from "./proof-missions";

describe("kstMonthStart", () => {
  it("returns the KST month start as a UTC instant", () => {
    expect(kstMonthStart(new Date("2026-11-06T05:00:00Z"))).toBe("2026-10-31T15:00:00.000Z");
    expect(kstMonthStart(new Date("2026-10-31T16:00:00Z"))).toBe("2026-10-31T15:00:00.000Z");
    expect(kstMonthStart(new Date("2026-10-31T14:59:00Z"))).toBe("2026-09-30T15:00:00.000Z");
  });
});

describe("readProofMissions (mock client)", () => {
  beforeEach(() => { rpc.mockReset(); from.mockReset(); });
  it("reads through list_proof_missions and never touches the closed tables", async () => {
    rpc.mockResolvedValue({ data: { missions: [{ id: "m", proofType: "receipt", platform: null, closesAt: "2026-12-01T00:00:00Z" }], openMissionIds: ["m"], approvedMissionIds: ["m"], monthCount: 2 }, error: null });
    const rows = await readProofMissions("c", "u");
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("list_proof_missions", { p_user: "u", p_celebrity: "c", p_month_start: kstMonthStart() });
    expect(rows).toEqual({ missions: [{ id: "m", proofType: "receipt", platform: null, closesAt: "2026-12-01T00:00:00Z" }], openMissionIds: ["m"], approvedMissionIds: ["m"], monthCount: 2 });
  });
  it("returns empty rows for an empty result and throws the database message on error", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await readProofMissions("c", "u")).toEqual({ missions: [], openMissionIds: [], approvedMissionIds: [], monthCount: 0 });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    await expect(readProofMissions("c", "u")).rejects.toThrow("permission denied");
  });
});
