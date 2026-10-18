import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  verify: vi.fn(), authorize: vi.fn(), rpc: vi.fn(), email: vi.fn(), accepted: vi.fn(), supabaseDelete: vi.fn(), privyDelete: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@privy-io/node", () => ({ PrivyClient: class { utils() { return { auth: () => ({ verifyAccessToken: state.verify }) }; } users() { return { delete: state.privyDelete }; } } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: state.rpc, auth: { admin: { deleteUser: state.supabaseDelete } }, storage: { from: vi.fn() } }) }));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL: "https://test.invalid", SUPABASE_SERVICE_ROLE_KEY: "test", PRIVY_APP_ID: "app", PRIVY_APP_SECRET: "test", PRIVY_APPLE_LOGIN_ENABLED: true }) }));
vi.mock("@/server/auth/privy-node-verifier", () => ({ createPrivyNodeAccessVerifier: () => ({ verify: vi.fn() }) }));
vi.mock("@/server/fan-auth/supabase-fan-auth-repository", () => ({ createSupabaseFanAuthRepository: () => ({}) }));
vi.mock("@/server/fan-auth/fan-auth-gate", () => ({ authorizeFanRequest: state.authorize }));
vi.mock("@/server/auth/email/email-auth", () => ({ EMAIL_TOKEN_PREFIX: "kyaa-email:", authenticateEmailAccessToken: state.email, verifyAcceptedEmailDeletion: state.accepted }));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createAccountDeletionDependencies } from "./account-deletion-dependencies";
import { createDeleteAccountHandler } from "./account-deletion";
beforeEach(() => {
  vi.clearAllMocks(); state.verify.mockResolvedValue({ app_id: "app", user_id: "did:privy:owner" });
  state.rpc.mockResolvedValue({ data: false, error: null }); state.authorize.mockResolvedValue({ appUserId: "owner" });
});
it("first deletion obeys the full fan/Apple lifecycle gate and creates no request on denial", async () => {
  state.authorize.mockRejectedValue(new AuthError("APPLE_REAUTHENTICATION_REQUIRED", 403, "Reauthenticate"));
  const response = await createDeleteAccountHandler(createAccountDeletionDependencies())(new Request("https://test.invalid/api/me/account", { method: "DELETE", headers: { authorization: "Bearer stale", "content-type": "application/json" }, body: '{"confirmation":"DELETE"}' }));
  expect(response.status).toBe(403);
  expect(state.authorize).toHaveBeenCalledWith(expect.objectContaining({ authorization: "Bearer stale" }));
  expect(state.rpc).toHaveBeenCalledTimes(1);
  expect(state.rpc).toHaveBeenCalledWith("has_approved_account_deletion", { p_privy_user_id: "did:privy:owner" });
});
it("permits a verified subject to retry only an already approved deletion", async () => {
  state.rpc.mockResolvedValue({ data: true, error: null });
  expect(await createAccountDeletionDependencies().verifySubject("Bearer old-session")).toBe("did:privy:owner");
  expect(state.authorize).not.toHaveBeenCalled();
  state.verify.mockResolvedValue({ app_id: "wrong-app", user_id: "did:privy:owner" });
  await expect(createAccountDeletionDependencies().verifySubject("Bearer bad")).rejects.toMatchObject({ status: 401 });
});

it("first email deletion requires the full live gate; only an accepted cryptographic retry may bypass it", async () => {
  state.email.mockResolvedValueOnce({supabaseUserId:"email-owner"});
  expect(await createAccountDeletionDependencies().verifySubject("Bearer kyaa-email:live")).toBe("supabase-email:email-owner");
  expect(state.accepted).not.toHaveBeenCalled();
  state.email.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED",401,"Denied"));
  state.accepted.mockRejectedValueOnce(new AuthError("AUTHENTICATION_REQUIRED",401,"Denied"));
  await expect(createAccountDeletionDependencies().verifySubject("Bearer kyaa-email:revoked")).rejects.toMatchObject({status:401});
  state.accepted.mockResolvedValueOnce("supabase-email:email-owner");
  expect(await createAccountDeletionDependencies().verifySubject("Bearer kyaa-email:accepted")).toBe("supabase-email:email-owner");
});
it("both provider 404s are idempotent while other failures remain retryable", async () => {
  const deps=createAccountDeletionDependencies();
  state.privyDelete.mockRejectedValueOnce({status:404}); state.supabaseDelete.mockResolvedValueOnce({error:{status:404}});
  await expect(deps.deleteProviderUser("did:privy:owner")).resolves.toBeUndefined();
  await expect(deps.deleteSupabaseUser!("owner")).resolves.toBeUndefined();
  state.privyDelete.mockRejectedValueOnce({status:500}); state.supabaseDelete.mockResolvedValueOnce({error:{status:500}});
  await expect(deps.deleteProviderUser("did:privy:owner")).rejects.toThrow("Provider cleanup unavailable");
  await expect(deps.deleteSupabaseUser!("owner")).rejects.toThrow("Provider cleanup unavailable");
});

it("does not bypass full email gate on transient provider errors", async () => {
  state.email.mockRejectedValueOnce(new AuthError("AUTH_RATE_LIMITED",429,"Retry"));
  await expect(createAccountDeletionDependencies().verifySubject("Bearer kyaa-email:live")).rejects.toMatchObject({status:429});
  expect(state.accepted).not.toHaveBeenCalled();
  state.email.mockRejectedValueOnce(new Error("Unavailable"));
  await expect(createAccountDeletionDependencies().verifySubject("Bearer kyaa-email:live")).rejects.toThrow("Unavailable");
  expect(state.accepted).not.toHaveBeenCalled();
});
