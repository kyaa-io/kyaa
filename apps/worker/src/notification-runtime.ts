import { SupabaseNotificationQueue } from "./adapters/supabase-notification-queue.js";
import { WebPushSender } from "./adapters/web-push-sender.js";
import type { NotificationWorkerEnv } from "./notification-env.js";
import { NotificationWorker } from "./notification-worker.js";
import { SupabaseExternalNotificationQueue } from "./adapters/supabase-external-notification-queue.js";
import { NotificationTestSinkSender } from "./adapters/notification-test-sink.js";
import { SesEmailSender, type SesV2SendClient } from "./adapters/ses-email-sender.js";
import { resolveSesEmailClient } from "./ses-account.js";
import { EmailSender } from "./adapters/email-sender.js";
import { KakaoSender } from "./adapters/kakao-sender.js";
import { ExternalNotificationWorker } from "./external-notification-worker.js";
import { runRunmusicDueOnce } from "./runmusic-due.js";
import { runRaffleRecipientRemindersOnce } from "./raffle-recipient-reminders.js";
import { runBusinessInquiryOnce } from "./business-inquiry-worker.js";
import { SupabaseKakaoNotificationQueue } from "./adapters/supabase-kakao-notification-queue.js";
import { KakaoNotificationWorker } from "./kakao-notification-worker.js";
import { SolapiClient } from "./solapi/index.js";
import { runTelegramAlertWorkerOnce, runTelegramCsWorkerOnce } from "./telegram-alert-worker.js";
import { runTelegramCommandWorkerOnce } from "./telegram-command-worker.js";
import { runTelegramCertificationWorkerOnce } from "./telegram-certification-worker.js";

async function runFanNotificationsOnce(
  env: NotificationWorkerEnv,
  remainingTimeInMillis: (() => number) | undefined,
  getSesClient: () => Promise<SesV2SendClient | undefined>,
) {
  const push = await new NotificationWorker(
    SupabaseNotificationQueue.create(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      env,
    ),
    new WebPushSender({
      subject: env.WEB_PUSH_VAPID_SUBJECT,
      publicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY,
      privateKey: env.WEB_PUSH_VAPID_PRIVATE_KEY,
    }),
    {
      workerId: env.NOTIFICATION_WORKER_ID,
      batchSize: env.NOTIFICATION_WORKER_BATCH_SIZE,
      leaseSeconds: env.NOTIFICATION_WORKER_LEASE_SECONDS,
    },
  ).runOnce();
  if(env.NOTIFICATION_EXTERNAL_MODE==="disabled")return push;
  const client = env.NOTIFICATION_EXTERNAL_MODE === "ses_email" ? await getSesClient() : undefined;
  const queue=SupabaseExternalNotificationQueue.create(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,env.NOTIFICATION_EXTERNAL_ENVIRONMENT,env.NOTIFICATION_EXTERNAL_MODE==="ses_email",env);
  const sink=new NotificationTestSinkSender(queue);
  const ses=env.NOTIFICATION_EXTERNAL_MODE==="ses_email"?new SesEmailSender({region:env.SES_REGION!,fromEmail:env.SES_FROM_EMAIL!,...(client?{client}:{}),...(env.SUPABASE_URL?{storageOrigin:new URL(env.SUPABASE_URL).origin}:{})}):null;
  const senders=env.NOTIFICATION_EXTERNAL_MODE==="test_sink"?{email:sink,kakao:sink}:ses?{email:ses,kakao:ses}:{email:new EmailSender({url:env.EMAIL_PROVIDER_URL!,token:env.EMAIL_PROVIDER_TOKEN!}),kakao:new KakaoSender({url:env.KAKAO_PROVIDER_URL!,token:env.KAKAO_PROVIDER_TOKEN!})};
  const external=await new ExternalNotificationWorker(queue,senders,{workerId:`${env.NOTIFICATION_WORKER_ID}:external`,batchSize:env.NOTIFICATION_EXTERNAL_MODE==="ses_email"?env.NOTIFICATION_EMAIL_BATCH_SIZE:env.NOTIFICATION_WORKER_BATCH_SIZE,leaseSeconds:env.NOTIFICATION_EXTERNAL_MODE==="ses_email"?300:env.NOTIFICATION_WORKER_LEASE_SECONDS,...(remainingTimeInMillis ? { remainingTimeInMillis } : {})}).runOnce();
  return push+external;
}

export async function runKakaoNotificationsOnce(env: NotificationWorkerEnv) {
  if (env.KAKAO_ALIMTALK_MODE === "disabled") return 0;
  return new KakaoNotificationWorker(
    SupabaseKakaoNotificationQueue.create(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env),
    new SolapiClient({apiKey:env.SOLAPI_API_KEY!,apiSecret:env.SOLAPI_API_SECRET!}),
    {
      workerId:`${env.NOTIFICATION_WORKER_ID.slice(0, 114)}:kakao`,
      leaseSeconds:Math.min(env.NOTIFICATION_WORKER_LEASE_SECONDS, 300),
    },
  ).runOnce();
}

export async function runNotificationWorkerOnce(
  env: NotificationWorkerEnv,
  remainingTimeInMillis?: () => number,
) {
  let sesClient: Promise<SesV2SendClient | undefined> | undefined;
  const getSesClient = () => sesClient ??= resolveSesEmailClient(env.SES_ROLE_ARN);
  // Each queue advances independently. Newly queued reminders can dispatch next tick.
  const results = await Promise.allSettled([
    runFanNotificationsOnce(env, remainingTimeInMillis, getSesClient),
    env.BUSINESS_INQUIRY_MODE === "ses_email"
      ? getSesClient().then((client) => runBusinessInquiryOnce(env, client))
      : runBusinessInquiryOnce(env),
    runRaffleRecipientRemindersOnce(env),
    runRunmusicDueOnce(env),
    runKakaoNotificationsOnce(env),
    runTelegramAlertWorkerOnce(env),
    runTelegramCsWorkerOnce(env),
    runTelegramCommandWorkerOnce(env),
    runTelegramCertificationWorkerOnce(env),
  ]);
  const queues = ["fan", "businessInquiry", "raffleReminders", "runmusic", "kakao", "telegramAlerts", "telegramCs", "telegramCommands", "telegramCertifications"];
  const modeStatus = (mode: string | undefined) => mode === "enabled" ? "enabled" : mode === undefined || mode === "disabled" ? "disabled" : "invalid";
  const deliveryModes = {
    Email: env.NOTIFICATION_EXTERNAL_MODE,
    BusinessInquiry: env.BUSINESS_INQUIRY_MODE,
    Kakao: env.KAKAO_ALIMTALK_MODE,
    TelegramAlerts: modeStatus(env.telegram.mode),
    TelegramCommands: modeStatus(env.telegram.commandMode),
    TelegramCertifications: modeStatus(env.telegram.certificationReviewMode),
  };
  console.info(JSON.stringify({
    event: "notification_worker_tick",
    deliveryModes,
    telegramModes: {
      alerts: modeStatus(env.telegram.mode),
      commands: modeStatus(env.telegram.commandMode),
      certifications: modeStatus(env.telegram.certificationReviewMode),
    },
    queues: Object.fromEntries(results.map((result, index) => [queues[index], result.status === "fulfilled"
      ? { status: "fulfilled", processed: result.value }
      : { status: "rejected" }])),
  }));
  if (env.NOTIFICATION_WORKER_ENABLED && env.NOTIFICATION_EXTERNAL_ENVIRONMENT === "prod") {
    for (const [Channel, Mode] of Object.entries(deliveryModes)) console.info(JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [{
          Namespace: "ByUs/Notifications",
          Dimensions: [["Environment", "Channel"]],
          Metrics: [{ Name: "Disabled", Unit: "Count" }],
        }],
      },
      Environment: "prod",
      Channel,
      Mode,
      Disabled: Mode === "disabled" || Mode === "invalid" ? 1 : 0,
    }));
  }
  if (results.some((result) => result.status === "rejected")) throw new Error("NOTIFICATION_RUNTIME_PARTIAL_FAILURE");
  return results.reduce((sum, result) => sum + (result.status === "fulfilled" ? result.value : 0), 0);
}
