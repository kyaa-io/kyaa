import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
afterEach(() => vi.unstubAllEnvs());
it("reports authenticated webhook hold for the actual deployed revision",async()=>{
 vi.stubEnv("CRON_SECRET","s".repeat(32));vi.stubEnv("RELEASE_SHA","a".repeat(40));vi.stubEnv("HOSTING_PROVIDER","aws");vi.stubEnv("CRON_OWNER","disabled");
 const buffer={environment:"dev",queueUrl:"https://sqs.ap-northeast-2.amazonaws.com/996702758024/byus-webhook-buffer-dev.fifo",bucket:"byus-webhooks-dev-996702758024",kmsKeyArn:"arn:aws:kms:ap-northeast-2:996702758024:key/11111111-1111-1111-1111-111111111111"};
 for(const [key,value] of Object.entries({APP_ENV:buffer.environment,WEBHOOK_BUFFER_QUEUE_URL:buffer.queueUrl,WEBHOOK_BUFFER_BUCKET:buffer.bucket,WEBHOOK_BUFFER_KMS_KEY_ID:buffer.kmsKeyArn}))vi.stubEnv(key,value);
 const configDigest=createHash("sha256").update(JSON.stringify(buffer)).digest("hex");
 const request=new Request("https://app.test/api/internal/cron/ownership",{headers:{authorization:`Bearer ${"s".repeat(32)}`}});
 for(const [hold,buffer,mode,accepting] of [["true","true","hold",false],["true","false","hold",false],["false","true","buffer",true],["false","false","direct",true]] as const){
  vi.stubEnv("WEBHOOK_INGRESS_HOLD",hold);vi.stubEnv("WEBHOOK_BUFFER_ENABLED",buffer);
  const response=GET(request);expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({owner:"disabled",provider:"aws",revision:"a".repeat(40),manifestVersion:1,webhookIntake:{mode,accepting,configDigest}});
 }
 vi.stubEnv("WEBHOOK_BUFFER_BUCKET",undefined);
 expect((await GET(request).json()).webhookIntake.configDigest).toBeNull();
});
it("keeps intake metadata behind authentication and a known revision",()=>{
 vi.stubEnv("CRON_SECRET","s".repeat(32));vi.stubEnv("WEBHOOK_INGRESS_HOLD","true");
 expect(GET(new Request("https://app.test/api/internal/cron/ownership")).status).toBe(401);
 vi.stubEnv("RELEASE_SHA",undefined);vi.stubEnv("VERCEL_GIT_COMMIT_SHA",undefined);
 expect(GET(new Request("https://app.test/api/internal/cron/ownership",{headers:{authorization:`Bearer ${"s".repeat(32)}`}})).status).toBe(503);
});
