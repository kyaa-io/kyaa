import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/config/env", () => ({ loadServerEnv: () => ({ SUPABASE_URL:"local",SUPABASE_SERVICE_ROLE_KEY:"synthetic" }) }));
vi.mock("@/server/data/client", () => ({ createClient: () => ({rpc}) }));
import { kakaoRegistrationDisabledResponse } from "./kakao-delivery-control";
beforeEach(() => vi.clearAllMocks());
it("blocks new registration when disabled and allows enabled delivery", async () => {
 rpc.mockResolvedValue({data:false,error:null});
 const response=await kakaoRegistrationDisabledResponse();
 expect(response?.status).toBe(503);
 expect(await response?.json()).toEqual({error:{code:"KAKAO_REGISTRATION_DISABLED"},retryable:false});
 rpc.mockResolvedValue({data:true,error:null});
 expect(await kakaoRegistrationDisabledResponse()).toBeNull();
});
it("fails closed on lookup errors", async () => {
 rpc.mockResolvedValue({data:true,error:{message:"secret"}});
 const response=await kakaoRegistrationDisabledResponse();
 expect(response?.status).toBe(503);expect(await response?.text()).not.toContain("secret");
});
it.each(["connected-accounts/kakao/start","connected-accounts/kakao/callback","notification-channels/kakao/enroll","notification-channels/kakao/enrollment/start","notification-channels/kakao/enrollment/confirm","notification-channels/kakao/phone/request","notification-channels/kakao/phone/verify","notification-channels/kakao/phone/confirm"])("guards %s before provider work", path => {
 const source=readFileSync(resolve(process.cwd(),`app/api/me/${path}/route.ts`),"utf8");
 expect(source).toMatch(/export async function POST\(request:\s*Request\)\s*\{\s*const disabled = await kakaoRegistrationDisabledResponse\(\);\s*if \(disabled\) return disabled;/);
});
