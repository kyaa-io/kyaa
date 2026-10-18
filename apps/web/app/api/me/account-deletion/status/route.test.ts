import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({verifySubject:vi.fn(),rpc:vi.fn()}));
vi.mock("@/server/profile/account-deletion-dependencies",()=>({createAccountDeletionDependencies:()=>state}));
import { GET } from "./route";
import { AuthError } from "@/features/auth/domain/auth-errors";
beforeEach(()=>vi.clearAllMocks());
it.each(["pending","completed"])("polls accepted email deletion %s after provider cleanup",async status=>{
 state.verifySubject.mockResolvedValue("supabase-email:11111111-1111-4111-8111-111111111111");state.rpc.mockResolvedValue({status});
 const response=await GET(new Request("https://kyaa.io/api/me/account-deletion/status"));
 expect(await response.json()).toEqual({deletion:{status}});
 expect(state.rpc).toHaveBeenCalledWith("mobile_get_email_account_deletion_status",{p_supabase_user_id:"11111111-1111-4111-8111-111111111111"});
});
it("keeps Privy polling unchanged and rejects an unverified subject",async()=>{
 state.verifySubject.mockResolvedValueOnce("did:privy:owner");state.rpc.mockResolvedValue({status:"pending"});
 expect((await GET(new Request("https://kyaa.io/status"))).status).toBe(200);
 expect(state.rpc).toHaveBeenCalledWith("mobile_get_account_deletion_status_by_subject",{p_privy_user_id:"did:privy:owner"});
 state.rpc.mockClear();state.verifySubject.mockRejectedValue(new AuthError("AUTHENTICATION_REQUIRED",401,"Denied"));
 expect((await GET(new Request("https://kyaa.io/status"))).status).toBe(401);expect(state.rpc).not.toHaveBeenCalled();
});
