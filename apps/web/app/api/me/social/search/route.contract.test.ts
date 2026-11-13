import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { AuthError } from "@/features/auth/domain/auth-errors";
import { createSocialHandlers } from "@/server/social/routes";
describe("nickname search boundary", () => {
 const actor="11111111-1111-4111-8111-111111111111";
 it("rejects signed out search without calling SQL",async()=>{
  const rpc=vi.fn();const api=createSocialHandlers({rpc,authorize:async()=>{throw new AuthError("AUTHENTICATION_REQUIRED",401,"Sign in");}});
  expect((await api.searchProfiles(new Request("https://test/api?q=nickname"))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
 });
 it("requires authentication and bounds nickname input before reading", async () => {
  const rpc=vi.fn(); const authorize=vi.fn(async()=>({appUserId:actor}));
  const api=createSocialHandlers({rpc,authorize});
  for(const q of ["", "a", "a".repeat(81)]) expect((await api.searchProfiles(new Request(`https://test/api?q=${q}`))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
 });
 it("returns only nickname and the profile reference; fails closed on extra personal fields", async()=>{
  const rpc=vi.fn().mockResolvedValue({items:[{profileId:actor,nickname:"팬친구"}]});
  const api=createSocialHandlers({rpc,authorize:async()=>({appUserId:actor})});
  const request=()=>new Request("https://test/api?q=팬친");
  expect((await api.searchProfiles(request())).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("search_social_profiles",{p_app_user_id:actor,p_query:"팬친"});
  rpc.mockResolvedValue({items:[{profileId:actor,nickname:"팬친구",email:"private"}]});
  expect((await api.searchProfiles(request())).status).toBe(503);
 });
});
