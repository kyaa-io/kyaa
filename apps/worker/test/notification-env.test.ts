import { describe, expect, it } from "vitest";
import { parseNotificationEnv } from "../src/notification-env.js";
const valid = {
  NOTIFICATION_WORKER_ENABLED: "true",
  NOTIFICATION_WORKER_ID: "notify-prod-1",
  NOTIFICATION_WORKER_BATCH_SIZE: "25",
  NOTIFICATION_WORKER_LEASE_SECONDS: "120",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "s".repeat(48),
  WEB_PUSH_VAPID_SUBJECT: "mailto:ops@byus.example",
  WEB_PUSH_VAPID_PUBLIC_KEY: "A".repeat(88),
  WEB_PUSH_VAPID_PRIVATE_KEY: "B".repeat(43),
};
describe("notification worker secrets", () => {
  it.each(["notifications@byus.kr", "notifications@kyaa.io"])("allows approved SES sender %s without Kakao", (SES_FROM_EMAIL) => {
    const ses = {...valid, NOTIFICATION_EXTERNAL_MODE:"ses_email",NOTIFICATION_WORKER_BATCH_SIZE:"2", NOTIFICATION_EMAIL_BATCH_SIZE:"40", SES_REGION:"ap-northeast-2", SES_FROM_EMAIL};
    expect(parseNotificationEnv(ses)).toMatchObject({NOTIFICATION_EXTERNAL_MODE:"ses_email",NOTIFICATION_WORKER_BATCH_SIZE:2,NOTIFICATION_EMAIL_BATCH_SIZE:40,SES_FROM_EMAIL});
    expect(() => parseNotificationEnv({...ses, NOTIFICATION_WORKER_BATCH_SIZE:"25"})).toThrow();
    expect(() => parseNotificationEnv({...ses, NOTIFICATION_EMAIL_BATCH_SIZE:"41"})).toThrow();
    expect(() => parseNotificationEnv({...ses, SES_FROM_EMAIL:undefined})).toThrow();
    expect(() => parseNotificationEnv({...ses, SES_REGION:"us-east-1"})).toThrow();
  });
  it("rejects unrelated SES senders and requires the same validated setting for business inquiries", () => {
    expect(() => parseNotificationEnv({...valid, NOTIFICATION_EXTERNAL_MODE:"ses_email", NOTIFICATION_WORKER_BATCH_SIZE:"2", SES_REGION:"ap-northeast-2", SES_FROM_EMAIL:"notifications@example.com"})).toThrow();
    const business = {...valid, BUSINESS_INQUIRY_MODE:"ses_email", NOTIFICATION_EXTERNAL_ENVIRONMENT:"prod"};
    expect(() => parseNotificationEnv(business)).toThrow();
    expect(parseNotificationEnv({...business, SES_REGION:"ap-northeast-2", SES_FROM_EMAIL:"notifications@byus.kr"})).toMatchObject({BUSINESS_INQUIRY_MODE:"ses_email"});
  });
  it("accepts complete VAPID and queue configuration without exposing values", () => {
    expect(parseNotificationEnv(valid)).toMatchObject({
      NOTIFICATION_WORKER_ID: "notify-prod-1",
      NOTIFICATION_EMAIL_BATCH_SIZE: 25,
    });
  });
  it.each([
    "SUPABASE_SERVICE_ROLE_KEY",
    "WEB_PUSH_VAPID_SUBJECT",
    "WEB_PUSH_VAPID_PUBLIC_KEY",
    "WEB_PUSH_VAPID_PRIVATE_KEY",
  ])("rejects missing required %s", (key) => {
    const source = { ...valid };
    delete source[key as keyof typeof source];
    expect(() => parseNotificationEnv(source)).toThrow();
  });
  it("rejects malformed VAPID private keys", () => {
    expect(() =>
      parseNotificationEnv({
        ...valid,
        WEB_PUSH_VAPID_PRIVATE_KEY: "not-a-key",
      }),
    ).toThrow();
  });
  it("allows the required Dev test sink but never a Production test sink",()=>{
    expect(parseNotificationEnv({...valid,NOTIFICATION_EXTERNAL_MODE:"test_sink",NOTIFICATION_EXTERNAL_ENVIRONMENT:"dev"})).toMatchObject({NOTIFICATION_EXTERNAL_MODE:"test_sink"});
    expect(()=>parseNotificationEnv({...valid,NOTIFICATION_EXTERNAL_MODE:"test_sink",NOTIFICATION_EXTERNAL_ENVIRONMENT:"prod"})).toThrow();
  });
  it("requires all sandbox provider endpoints and tokens in provider mode",()=>{
    expect(()=>parseNotificationEnv({...valid,NOTIFICATION_EXTERNAL_MODE:"provider"})).toThrow();
    expect(parseNotificationEnv({...valid,NOTIFICATION_EXTERNAL_MODE:"provider",EMAIL_PROVIDER_URL:"https://email.test/send",EMAIL_PROVIDER_TOKEN:"e".repeat(16),KAKAO_PROVIDER_URL:"https://kakao.test/send",KAKAO_PROVIDER_TOKEN:"k".repeat(16)})).toMatchObject({NOTIFICATION_EXTERNAL_MODE:"provider"});
  });
  it("keeps Kakao independently disabled and requires both SOLAPI credentials when enabled",()=>{
    expect(parseNotificationEnv(valid).KAKAO_ALIMTALK_MODE).toBe("disabled");
    expect(()=>parseNotificationEnv({...valid,KAKAO_ALIMTALK_MODE:"solapi"})).toThrow();
    expect(()=>parseNotificationEnv({...valid,KAKAO_ALIMTALK_MODE:"solapi",SOLAPI_API_KEY:"solapi_key"})).toThrow();
    expect(parseNotificationEnv({...valid,KAKAO_ALIMTALK_MODE:"solapi",SOLAPI_API_KEY:"solapi_key",SOLAPI_API_SECRET:"solapi-secret"})).toMatchObject({KAKAO_ALIMTALK_MODE:"solapi"});
  });
});

it("inquiry sending is separately gated and production-only", () => {
  const source = { NOTIFICATION_WORKER_ID: "inquiry-test", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "s".repeat(48), WEB_PUSH_VAPID_SUBJECT: "mailto:ops@byus.kr", WEB_PUSH_VAPID_PUBLIC_KEY: "a".repeat(88), WEB_PUSH_VAPID_PRIVATE_KEY: "b".repeat(43) };
  expect(parseNotificationEnv(source).BUSINESS_INQUIRY_MODE).toBe("disabled");
  expect(() => parseNotificationEnv({ ...source, BUSINESS_INQUIRY_MODE: "ses_email" })).toThrow();
  expect(parseNotificationEnv({ ...source, BUSINESS_INQUIRY_MODE: "ses_email", NOTIFICATION_EXTERNAL_ENVIRONMENT: "prod", SES_REGION: "ap-northeast-2", SES_FROM_EMAIL: "notifications@byus.kr" }).BUSINESS_INQUIRY_MODE).toBe("ses_email");
});

it("keeps Telegram configuration raw so invalid values cannot fail common parsing", () => {
  const env = parseNotificationEnv({
    ...valid,
    TELEGRAM_ALERT_MODE: "invalid-mode",
    TELEGRAM_BOT_TOKEN: "invalid-token",
    TELEGRAM_CHAT_ID: "not-a-group",
  });
  expect(env.telegram).toEqual({
    mode: "invalid-mode",
    commandMode: undefined,
    certificationReviewMode: "disabled",
    token: "invalid-token",
    chatId: "not-a-group",
  });
});

it("does not consume browser-public Telegram fields", () => {
  const env = parseNotificationEnv({
    ...valid,
    NEXT_PUBLIC_TELEGRAM_BOT_TOKEN: "browser-secret",
    NEXT_PUBLIC_TELEGRAM_CHAT_ID: "-1001234567890",
  });
  expect(env.telegram).toEqual({ mode: undefined, commandMode: undefined, certificationReviewMode: "disabled", token: undefined, chatId: undefined });
  expect(env).not.toHaveProperty("NEXT_PUBLIC_TELEGRAM_BOT_TOKEN");
  expect(env).not.toHaveProperty("NEXT_PUBLIC_TELEGRAM_CHAT_ID");
});

it("keeps invalid Telegram command mode isolated from common parsing", () => {
  expect(parseNotificationEnv({ ...valid, TELEGRAM_COMMAND_MODE: "invalid" }).telegram.commandMode).toBe("invalid");
});

it("defaults Telegram certification review mode to disabled semantics and keeps validation isolated", () => {
  expect(parseNotificationEnv(valid).telegram.certificationReviewMode).toBe("disabled");
  expect(parseNotificationEnv({ ...valid, TELEGRAM_CERTIFICATION_REVIEW_MODE: "disabled" }).telegram.certificationReviewMode).toBe("disabled");
  expect(parseNotificationEnv({ ...valid, TELEGRAM_CERTIFICATION_REVIEW_MODE: "invalid" }).telegram.certificationReviewMode).toBe("invalid");
});

it("requires explicit private S3 configuration only when storage is enabled", () => {
  expect(parseNotificationEnv(valid).AWS_STORAGE_ENABLED).toBe(false);
  expect(() => parseNotificationEnv({ ...valid, AWS_STORAGE_ENABLED: "true" })).toThrow("AWS storage requires");
  expect(parseNotificationEnv({ ...valid, AWS_STORAGE_ENABLED: "true", AWS_REGION: "ap-northeast-2", S3_PRIVATE_BUCKET: "private-assets" })).toMatchObject({ AWS_STORAGE_ENABLED: true, S3_PRIVATE_BUCKET: "private-assets" });
});

it("supports a fully AWS notification worker without legacy credentials and binds its private REST endpoint", () => {
  const {SUPABASE_URL:_url,SUPABASE_SERVICE_ROLE_KEY:_key,...base}=valid;
  const aws={...base,NOTIFICATION_EXTERNAL_ENVIRONMENT:"prod",BYUS_DATA_ENVIRONMENT:"production",POSTGREST_URL:"https://data.kyaa.io",POSTGREST_SERVICE_TOKEN:"t".repeat(48),AWS_STORAGE_ENABLED:"true",AWS_REGION:"ap-northeast-2",S3_PRIVATE_BUCKET:"private-assets"};
  expect(parseNotificationEnv(aws).SUPABASE_URL).toBeUndefined();
  for(const POSTGREST_URL of ["https://data.dev.kyaa.io","https://data.kyaa.io:444","https://data.kyaa.io/?secret=x","https://u:p@data.kyaa.io","https://data.kyaa.io/path","http://data.kyaa.io"]){expect(()=>parseNotificationEnv({...aws,POSTGREST_URL})).toThrow("exact environment endpoint");}
  expect(()=>parseNotificationEnv({...aws,BYUS_DATA_ENVIRONMENT:"development"})).toThrow("database environment");
  expect(()=>parseNotificationEnv({...aws,AWS_STORAGE_ENABLED:"false"})).toThrow("Notification storage requires");
});


it("limits the temporary SES bridge to the approved production role and kyaa sender", () => {
 const bridge = { ...valid, NOTIFICATION_EXTERNAL_ENVIRONMENT: "prod", SES_FROM_EMAIL: "notifications@kyaa.io", SES_ROLE_ARN: "arn:aws:iam::200151116034:role/byus-notification-prod-email-bridge" };
 expect(parseNotificationEnv(bridge).SES_ROLE_ARN).toBe(bridge.SES_ROLE_ARN);
 expect(() => parseNotificationEnv({ ...bridge, NOTIFICATION_EXTERNAL_ENVIRONMENT: "dev" })).toThrow();
 expect(() => parseNotificationEnv({ ...bridge, SES_FROM_EMAIL: "notifications@byus.kr" })).toThrow();
 expect(() => parseNotificationEnv({ ...bridge, SES_ROLE_ARN: "arn:aws:iam::111111111111:role/other" })).toThrow();
});
