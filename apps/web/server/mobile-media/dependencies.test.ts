import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MediaValidationJob, MediaWorkerDependencies } from "./worker";
const state = vi.hoisted(() => ({ rpc: vi.fn(), fetch: vi.fn(), timeout: 1000 }));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: state.rpc }) }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://storage.example.test", SUPABASE_SERVICE_ROLE_KEY: "test" }) }));
vi.mock("@/server/auth/privy-node-verifier", () => ({ createPrivyNodeAccessVerifier: () => ({}) }));
vi.mock("@/server/fan-auth/supabase-fan-auth-repository", () => ({ createSupabaseFanAuthRepository: () => ({}) }));
vi.mock("./worker", () => ({ processMediaCleanup: vi.fn(), processMediaValidationJob: async (worker: MediaWorkerDependencies) => {
  await worker.upload("owner/asset/display.webp", new Uint8Array([1]), "image/webp", { assetId: "asset", assetVersion: 2, jobId: "job" } as MediaValidationJob, state.timeout);
  return true;
} }));
import { createMobileMediaMaintenance } from "./dependencies";
beforeEach(() => { state.rpc.mockReset(); state.rpc.mockResolvedValue({ data: null, error: null }); state.fetch.mockReset(); state.fetch.mockResolvedValue(new Response(null, { status: 200 })); state.timeout = 1000; vi.stubGlobal("fetch", state.fetch); });
afterEach(() => vi.unstubAllGlobals());
it("awaits a late upload and its durable cleanup fence before returning", async () => {
  let finishUpload!: (response: Response) => void, finishFence!: (result: unknown) => void;
  state.fetch.mockImplementationOnce(() => new Promise(resolve => { finishUpload = resolve; }));
  state.rpc.mockImplementationOnce(() => new Promise(resolve => { finishFence = resolve; }));
  let done = false; const processing = createMobileMediaMaintenance().process().then(() => { done = true; });
  await vi.waitFor(() => expect(state.fetch).toHaveBeenCalledOnce()); expect(state.rpc).not.toHaveBeenCalled();
  finishUpload(new Response()); await vi.waitFor(() => expect(state.rpc).toHaveBeenCalledOnce()); expect(done).toBe(false);
  expect(state.rpc).toHaveBeenCalledWith("reconcile_mobile_media_upload_cleanup", { p_asset_id: "asset", p_asset_version: 2, p_job_id: "job" });
  finishFence({ data: null, error: null }); await processing; expect(done).toBe(true);
});
it("uses a bounded upload and reconciles after transport abortion", async () => {
  state.timeout = 10;
  state.fetch.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason))));
  await expect(createMobileMediaMaintenance().process()).rejects.toThrow();
  expect(state.rpc).toHaveBeenCalledOnce();
});
it("does not silently lose a failed cleanup reconciliation", async () => {
  state.rpc.mockResolvedValue({ error: { message: "database unavailable" } });
  await expect(createMobileMediaMaintenance().process()).rejects.toThrow("database unavailable");
});
