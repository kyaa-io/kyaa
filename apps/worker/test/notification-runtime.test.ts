import { beforeEach, expect, it, vi } from "vitest";
const state=vi.hoisted(()=>({queue:vi.fn(),push:vi.fn(),pushRun:vi.fn(),sesClient:vi.fn(),external:vi.fn(),ses:vi.fn(),http:vi.fn(),inquiry:vi.fn(),reminders:vi.fn(),runmusic:vi.fn(),kakaoQueue:vi.fn(),kakaoWorker:vi.fn(),solapi:vi.fn(),telegram:vi.fn(),cs:vi.fn(),commands:vi.fn(),certifications:vi.fn()}));
vi.mock("../src/adapters/supabase-notification-queue.js",()=>({SupabaseNotificationQueue:{create:()=>({})}}));
vi.mock("../src/adapters/web-push-sender.js",()=>({WebPushSender:class {}}));
vi.mock("../src/notification-worker.js",()=>({NotificationWorker:class {constructor(...args:unknown[]){state.push(...args);}async runOnce(){return state.pushRun();}}}));
vi.mock("../src/adapters/supabase-external-notification-queue.js",()=>({SupabaseExternalNotificationQueue:{create:state.queue}}));
vi.mock("../src/adapters/notification-test-sink.js",()=>({NotificationTestSinkSender:class {}}));
vi.mock("../src/adapters/ses-email-sender.js",()=>({SesEmailSender:class {constructor(config:unknown){state.ses(config);}}}));
vi.mock("../src/adapters/email-sender.js",()=>({EmailSender:class {constructor(){state.http();}}}));
vi.mock("../src/adapters/kakao-sender.js",()=>({KakaoSender:class {constructor(){state.http();}}}));
vi.mock("../src/external-notification-worker.js",()=>({ExternalNotificationWorker:class {constructor(...args:unknown[]){state.external(...args);}async runOnce(){return 1;}}}));
vi.mock("../src/business-inquiry-worker.js",()=>({runBusinessInquiryOnce:state.inquiry}));
vi.mock("../src/runmusic-due.js",()=>({runRunmusicDueOnce:state.runmusic}));
vi.mock("../src/raffle-recipient-reminders.js",()=>({runRaffleRecipientRemindersOnce:state.reminders}));
vi.mock("../src/adapters/supabase-kakao-notification-queue.js",()=>({SupabaseKakaoNotificationQueue:{create:state.kakaoQueue}}));
vi.mock("../src/kakao-notification-worker.js",()=>({KakaoNotificationWorker:class {constructor(...args:unknown[]){state.kakaoWorker(...args);}async runOnce(){return 4;}}}));
vi.mock("../src/solapi/index.js",()=>({SolapiClient:class {constructor(config:unknown){state.solapi(config);}}}));
vi.mock("../src/telegram-alert-worker.js",()=>({runTelegramAlertWorkerOnce:state.telegram,runTelegramCsWorkerOnce:state.cs}));
vi.mock("../src/telegram-command-worker.js",()=>({runTelegramCommandWorkerOnce:state.commands}));
vi.mock("../src/telegram-certification-worker.js",()=>({runTelegramCertificationWorkerOnce:state.certifications}));
vi.mock("../src/ses-account.js",()=>({LEGACY_SES_ROLE_ARN:"arn:aws:iam::200151116034:role/byus-notification-prod-email-bridge",resolveSesEmailClient:state.sesClient}));
import {runNotificationWorkerOnce} from "../src/notification-runtime.js";
import {parseNotificationEnv} from "../src/notification-env.js";
const source={NOTIFICATION_WORKER_ID:"runtime-test",SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"s".repeat(48),WEB_PUSH_VAPID_SUBJECT:"mailto:ops@byus.kr",WEB_PUSH_VAPID_PUBLIC_KEY:"a".repeat(88),WEB_PUSH_VAPID_PRIVATE_KEY:"b".repeat(43)};
beforeEach(()=>{vi.clearAllMocks();state.pushRun.mockResolvedValue(2);state.sesClient.mockResolvedValue(undefined);state.inquiry.mockResolvedValue(0);state.reminders.mockResolvedValue(0);state.runmusic.mockResolvedValue(0);state.kakaoQueue.mockReturnValue({});state.telegram.mockResolvedValue(0);state.cs.mockResolvedValue(0);state.commands.mockResolvedValue(0);state.certifications.mockResolvedValue(0);});
it("keeps all external providers dormant by default",async()=>{
 expect(await runNotificationWorkerOnce(parseNotificationEnv(source))).toBe(2);
 expect(state.queue).not.toHaveBeenCalled();expect(state.ses).not.toHaveBeenCalled();
 expect(state.kakaoQueue).not.toHaveBeenCalled();expect(state.solapi).not.toHaveBeenCalled();
 expect(state.telegram).toHaveBeenCalledExactlyOnceWith(parseNotificationEnv(source));
 expect(state.commands).toHaveBeenCalledExactlyOnceWith(parseNotificationEnv(source));
 expect(state.certifications).toHaveBeenCalledExactlyOnceWith(parseNotificationEnv(source));
});
it("keeps push at two while wiring a 40-item, 300-second SES batch",async()=>{
 const env=parseNotificationEnv({...source,NOTIFICATION_EXTERNAL_MODE:"ses_email",NOTIFICATION_WORKER_BATCH_SIZE:"2",NOTIFICATION_EMAIL_BATCH_SIZE:"40",SES_REGION:"ap-northeast-2",SES_FROM_EMAIL:"notifications@byus.kr"});
 const remainingTimeInMillis=()=>250_000;
 expect(await runNotificationWorkerOnce(env,remainingTimeInMillis)).toBe(3);
 expect(state.queue).toHaveBeenCalledWith(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,"dev",true,env);
 expect(state.push).toHaveBeenCalledWith(expect.anything(),expect.anything(),{
  workerId:"runtime-test",batchSize:2,leaseSeconds:120,
 });
 expect(state.ses).toHaveBeenCalledExactlyOnceWith({region:"ap-northeast-2",fromEmail:"notifications@byus.kr",storageOrigin:"https://example.supabase.co"});
 expect(state.http).not.toHaveBeenCalled();expect(state.external).toHaveBeenCalledWith(undefined,expect.anything(),{
  workerId:"runtime-test:external",batchSize:40,leaseSeconds:300,remainingTimeInMillis,
 });
});
it("preserves the Dev sink for both channels",async()=>{
 const env=parseNotificationEnv({...source,NOTIFICATION_EXTERNAL_MODE:"test_sink"});
 await runNotificationWorkerOnce(env);
 expect(state.queue).toHaveBeenCalledWith(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,"dev",false,env);
 expect(state.ses).not.toHaveBeenCalled();expect(state.http).not.toHaveBeenCalled();
});

it("runs SOLAPI through its dedicated queue while Email remains disabled",async()=>{
 const env=parseNotificationEnv({...source,KAKAO_ALIMTALK_MODE:"solapi",SOLAPI_API_KEY:"solapi_key",SOLAPI_API_SECRET:"solapi-secret"});
 expect(await runNotificationWorkerOnce(env)).toBe(6);
 expect(state.queue).not.toHaveBeenCalled();
 expect(state.external).not.toHaveBeenCalled();
 expect(state.kakaoQueue).toHaveBeenCalledWith(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,env);
 expect(state.solapi).toHaveBeenCalledWith({apiKey:"solapi_key",apiSecret:"solapi-secret"});
 expect(state.kakaoWorker).toHaveBeenCalledWith(expect.anything(),expect.anything(),{workerId:"runtime-test:kakao",leaseSeconds:120});
});

it("bounds the dedicated Kakao worker identity and lease to the queue contract",async()=>{
 const workerId="w".repeat(120);
 const env=parseNotificationEnv({...source,NOTIFICATION_WORKER_ID:workerId,NOTIFICATION_WORKER_LEASE_SECONDS:"900",KAKAO_ALIMTALK_MODE:"solapi",SOLAPI_API_KEY:"solapi_key",SOLAPI_API_SECRET:"solapi-secret"});
 await runNotificationWorkerOnce(env);
 expect(state.kakaoWorker).toHaveBeenCalledWith(expect.anything(),expect.anything(),{
  workerId:`${"w".repeat(114)}:kakao`,
  leaseSeconds:300,
 });
});

it("isolates inquiry processing from fan queue failure",async()=>{
 state.queue.mockImplementationOnce(()=>{throw new Error("fan queue failed");});
 const env=parseNotificationEnv({...source,NOTIFICATION_EXTERNAL_MODE:"test_sink"});
 await expect(runNotificationWorkerOnce(env)).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
 expect(state.inquiry).toHaveBeenCalledExactlyOnceWith(env);
});
it("runs inquiry maintenance even with external email disabled",async()=>{
 await runNotificationWorkerOnce(parseNotificationEnv(source));
 expect(state.inquiry).toHaveBeenCalledOnce();
});

it("keeps notification queues advancing if reminder maintenance fails",async()=>{state.reminders.mockRejectedValueOnce(new Error("db"));await expect(runNotificationWorkerOnce(parseNotificationEnv(source))).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");expect(state.inquiry).toHaveBeenCalledOnce();});

it("adds successfully sent Telegram alert items to the processed count", async () => {
 state.telegram.mockResolvedValueOnce(4);
 await expect(runNotificationWorkerOnce(parseNotificationEnv(source))).resolves.toBe(6);
});

it("isolates invalid Telegram configuration until all existing branches run", async () => {
 state.telegram.mockRejectedValueOnce(new Error("TELEGRAM_ALERT_CONFIG_INVALID"));
 await expect(runNotificationWorkerOnce(parseNotificationEnv(source))).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
 expect(state.inquiry).toHaveBeenCalledOnce();
 expect(state.reminders).toHaveBeenCalledOnce();
});

it("isolates Telegram command failures after all existing branches run", async () => {
 state.commands.mockRejectedValueOnce(new Error("TELEGRAM_COMMAND_CONFIG_INVALID"));
 await expect(runNotificationWorkerOnce(parseNotificationEnv(source))).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
 expect(state.inquiry).toHaveBeenCalledOnce(); expect(state.reminders).toHaveBeenCalledOnce(); expect(state.telegram).toHaveBeenCalledOnce();
});

it("adds completed certification deliveries to the processed count and isolates their failure", async () => {
 state.certifications.mockResolvedValueOnce(1);
 await expect(runNotificationWorkerOnce(parseNotificationEnv(source))).resolves.toBe(3);
 state.certifications.mockRejectedValueOnce(new Error("TELEGRAM_CERTIFICATION_CONFIG_INVALID"));
 await expect(runNotificationWorkerOnce(parseNotificationEnv(source))).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
 expect(state.commands).toHaveBeenCalledTimes(2);
});

it("processes RUNMUSIC even with email disabled and isolates its failure", async () => {
 const env = parseNotificationEnv(source);
 await runNotificationWorkerOnce(env);
 expect(state.runmusic).toHaveBeenCalledExactlyOnceWith(env);
 state.runmusic.mockRejectedValueOnce(new Error("db"));
 await expect(runNotificationWorkerOnce(env)).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
 expect(state.inquiry).toHaveBeenCalledTimes(2);
});


it("reports disabled Telegram modes and failed queue names without logging secrets or provider errors", async () => {
 const log = vi.spyOn(console, "info").mockImplementation(() => {});
 try {
  const env = parseNotificationEnv(source);
  state.telegram.mockRejectedValueOnce(new Error("private provider response and token"));
  await expect(runNotificationWorkerOnce(env)).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
  const summary = JSON.parse(log.mock.calls[0]![0] as string);
  expect(summary.event).toBe("notification_worker_tick");
  expect(summary.telegramModes).toEqual({ alerts: "disabled", commands: "disabled", certifications: "disabled" });
  expect(summary.queues.telegramAlerts).toEqual({ status: "rejected" });
  expect(summary.queues.fan).toEqual({ status: "fulfilled", processed: 2 });
  expect(summary.queues.telegramCommands).toEqual({ status: "fulfilled", processed: 0 });
  expect(JSON.stringify(summary)).not.toMatch(/private provider|token|example.com|supabase|ssssssss/);
  await runNotificationWorkerOnce(parseNotificationEnv({ ...source, TELEGRAM_ALERT_MODE: "secret-config-value", TELEGRAM_COMMAND_MODE: "enabled" }));
  const invalid = JSON.parse(log.mock.calls[1]![0] as string);
  expect(invalid.telegramModes).toEqual({ alerts: "invalid", commands: "enabled", certifications: "disabled" });
  expect(JSON.stringify(invalid)).not.toContain("secret-config-value");
 } finally { log.mockRestore(); }
});


it("emits independent disabled-channel metrics only for an enabled production worker", async () => {
 const log = vi.spyOn(console, "info").mockImplementation(() => {});
 try {
  const env = parseNotificationEnv({ ...source, NOTIFICATION_WORKER_ENABLED: "true", NOTIFICATION_EXTERNAL_ENVIRONMENT: "prod", KAKAO_ALIMTALK_MODE: "solapi", SOLAPI_API_KEY: "test-api-key", SOLAPI_API_SECRET: "test-private-secret", TELEGRAM_ALERT_MODE: "enabled", TELEGRAM_COMMAND_MODE: "private-invalid-mode" });
  await runNotificationWorkerOnce(env);
  const records = log.mock.calls.map(([value]) => JSON.parse(value as string));
  const metrics = records.filter(value => value._aws);
  expect(metrics).toHaveLength(6);
  expect(Object.fromEntries(metrics.map(value => [value.Channel, value.Disabled]))).toEqual({ Email: 1, BusinessInquiry: 1, Kakao: 0, TelegramAlerts: 0, TelegramCommands: 1, TelegramCertifications: 1 });
  expect(metrics.every(value => value.Environment === "prod" && value._aws.CloudWatchMetrics[0].Dimensions[0].includes("Channel"))).toBe(true);
  expect(records[0].deliveryModes).toMatchObject({ Email: "disabled", BusinessInquiry: "disabled", Kakao: "solapi", TelegramCommands: "invalid" });
  expect(JSON.stringify(records)).not.toMatch(/test-private-secret|test-api-key|private-invalid-mode|ssssssss/);
  log.mockClear();
  await runNotificationWorkerOnce({ ...env, NOTIFICATION_WORKER_ENABLED: false });
  expect(log.mock.calls).toHaveLength(1);
  log.mockClear();
  await runNotificationWorkerOnce({ ...env, NOTIFICATION_EXTERNAL_ENVIRONMENT: "staging" });
  expect(log.mock.calls).toHaveLength(1);
 } finally { log.mockRestore(); }
});


it("resolves legacy credentials lazily and isolates fan-only SES failure while push is slow", async () => {
 let finishPush!: (value: number) => void;
 state.pushRun.mockReturnValueOnce(new Promise<number>(resolve => { finishPush = resolve; }));
 state.sesClient.mockRejectedValueOnce(new Error("private STS response"));
 const env = parseNotificationEnv({ ...source, NOTIFICATION_EXTERNAL_ENVIRONMENT: "prod", NOTIFICATION_EXTERNAL_MODE: "ses_email", NOTIFICATION_WORKER_BATCH_SIZE: "2", SES_REGION: "ap-northeast-2", SES_FROM_EMAIL: "notifications@kyaa.io", SES_ROLE_ARN: "arn:aws:iam::200151116034:role/byus-notification-prod-email-bridge" });
 const task = runNotificationWorkerOnce(env);
 expect(state.sesClient).not.toHaveBeenCalled();
 expect(state.commands).toHaveBeenCalledOnce();
 finishPush(2);
 await expect(task).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
 expect(state.sesClient).toHaveBeenCalledOnce();
 expect(state.queue).not.toHaveBeenCalled();
 expect(state.external).not.toHaveBeenCalled();
 expect(state.inquiry).toHaveBeenCalledExactlyOnceWith(env);
});

it("shares one preflight client across both email paths before either can claim", async () => {
 const client = { send: vi.fn() };
 state.sesClient.mockResolvedValueOnce(client);
 const env = parseNotificationEnv({ ...source, NOTIFICATION_EXTERNAL_ENVIRONMENT: "prod", NOTIFICATION_EXTERNAL_MODE: "ses_email", BUSINESS_INQUIRY_MODE: "ses_email", NOTIFICATION_WORKER_BATCH_SIZE: "2", SES_REGION: "ap-northeast-2", SES_FROM_EMAIL: "notifications@kyaa.io", SES_ROLE_ARN: "arn:aws:iam::200151116034:role/byus-notification-prod-email-bridge" });
 await runNotificationWorkerOnce(env);
 expect(state.sesClient).toHaveBeenCalledExactlyOnceWith(env.SES_ROLE_ARN);
 expect(state.ses).toHaveBeenCalledWith(expect.objectContaining({ client }));
 expect(state.inquiry).toHaveBeenCalledExactlyOnceWith(env, client);
 state.sesClient.mockRejectedValueOnce(new Error("private STS response"));
 state.queue.mockClear(); state.inquiry.mockClear();
 await expect(runNotificationWorkerOnce(env)).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
 expect(state.queue).not.toHaveBeenCalled(); expect(state.inquiry).not.toHaveBeenCalled();
 expect(state.commands).toHaveBeenCalledTimes(2);
});

it("keeps all existing queues advancing when the independent CS branch fails", async()=>{
 state.cs.mockRejectedValueOnce(new Error("TELEGRAM_CS_CONFIG_INVALID"));
 await expect(runNotificationWorkerOnce(parseNotificationEnv(source))).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
 expect(state.telegram).toHaveBeenCalledOnce(); expect(state.inquiry).toHaveBeenCalledOnce(); expect(state.pushRun).toHaveBeenCalledOnce();
 state.telegram.mockRejectedValueOnce(new Error("old room unavailable")); state.cs.mockResolvedValueOnce(1);
 await expect(runNotificationWorkerOnce(parseNotificationEnv(source))).rejects.toThrow("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
 expect(state.cs).toHaveBeenCalledTimes(2);
});
