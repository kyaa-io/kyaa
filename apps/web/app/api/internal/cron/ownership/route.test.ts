import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => vi.unstubAllEnvs());
it("reports authenticated webhook hold for the actual deployed revision",async()=>{
 vi.stubEnv("CRON_SECRET","s".repeat(32));vi.stubEnv("RELEASE_SHA","a".repeat(40));vi.stubEnv("HOSTING_PROVIDER","aws");vi.stubEnv("CRON_OWNER","disabled");
 const request=new Request("https://app.test/api/internal/cron/ownership",{headers:{authorization:`Bearer ${"s".repeat(32)}`}});
 for(const [hold,buffer,mode,accepting] of [["true","true","hold",false],["true","false","hold",false],["false","true","buffer",true],["false","false","direct",true]] as const){
  vi.stubEnv("WEBHOOK_INGRESS_HOLD",hold);vi.stubEnv("WEBHOOK_BUFFER_ENABLED",buffer);
  const response=GET(request);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({owner:"disabled",provider:"aws",revision:"a".repeat(40),manifestVersion:1,webhookIntake:{mode,accepting}});
 }
});
it("keeps intake metadata behind authentication and a known revision",()=>{
 vi.stubEnv("CRON_SECRET","s".repeat(32));vi.stubEnv("WEBHOOK_INGRESS_HOLD","true");
 expect(GET(new Request("https://app.test/api/internal/cron/ownership")).status).toBe(401);
 vi.stubEnv("RELEASE_SHA",undefined);vi.stubEnv("VERCEL_GIT_COMMIT_SHA",undefined);
 expect(GET(new Request("https://app.test/api/internal/cron/ownership",{headers:{authorization:`Bearer ${"s".repeat(32)}`}})).status).toBe(503);
});
