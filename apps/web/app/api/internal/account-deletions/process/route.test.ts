import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only",()=>({}));
const mock=vi.hoisted(()=>({pool:"pool",retry:vi.fn(),cleanup:vi.fn()}));
vi.mock("@/server/config/env",()=>({loadServerEnv:()=>({COGNITO_USER_POOL_ID:mock.pool,AUTH_PROVIDER:"privy"})}));
vi.mock("@/server/auth/cognito/config",()=>({cognitoCleanupConfig:()=>({clientId:"client"})}));
vi.mock("@/server/auth/cognito/browser-session",()=>({retryRemoteRevocations:mock.retry}));
vi.mock("@/server/profile/account-deletion-dependencies",()=>({createAccountDeletionDependencies:()=>({})}));
vi.mock("@/server/profile/account-deletion",()=>({processAccountDeletion:mock.cleanup,processContentAssetCleanup:async()=>0,processMobileMediaCleanup:async()=>0}));
import {GET} from "./route";
const request=(authorized=true,scheduler="aws")=>new Request("https://kyaa.io/api/internal/account-deletions/process",{headers:{authorization:authorized?`Bearer ${"c".repeat(32)}`:"invalid","x-byus-scheduler":scheduler}});
beforeEach(()=>{vi.resetAllMocks();mock.pool="pool";mock.retry.mockResolvedValue({attempted:1,pending:0});mock.cleanup.mockResolvedValue("idle");vi.stubEnv("CRON_SECRET","c".repeat(32));vi.stubEnv("CRON_OWNER","aws");});
afterEach(()=>vi.unstubAllEnvs());
it.each([[false,"aws",401],[true,"vercel",204]] as const)("does not run work for unauthorized or non-owner cron",async(auth,scheduler,status)=>{
 expect((await GET(request(auth,scheduler))).status).toBe(status);expect(mock.retry).not.toHaveBeenCalled();expect(mock.cleanup).not.toHaveBeenCalled();
});
it("continues draining when auth has reverted to Privy",async()=>{
 expect((await GET(request())).status).toBe(200);expect(mock.retry).toHaveBeenCalledOnce();
});
it("does not require Cognito configuration in an installation without a pool",async()=>{
 mock.pool="";expect((await GET(request())).status).toBe(200);expect(mock.retry).not.toHaveBeenCalled();expect(mock.cleanup).toHaveBeenCalledOnce();
});
it.each(["cleanup","retry"] as const)("still runs both tasks when %s fails",async(task)=>{
 mock[task].mockRejectedValue(new Error("unavailable"));
 expect((await GET(request())).status).toBe(503);expect(mock.retry).toHaveBeenCalledOnce();expect(mock.cleanup).toHaveBeenCalledOnce();
});
