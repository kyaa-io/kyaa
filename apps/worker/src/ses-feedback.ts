import { z } from "zod";
import { createWorkerClient, type WorkerDataClient } from "./data-client.js";
import { parseBenefitMaintenanceEnv, type BenefitMaintenanceEnv } from "./benefit-maintenance.js";

// SES event publishing (configuration set -> SNS -> this Lambda). Unknown
// fields are dropped by the schemas; only what record_ses_email_event needs
// is forwarded. Diagnostic text, headers and sender details never leave here.
const ACCOUNT = "996702758024";
const lambdaConfig = z.object({
  SES_FEEDBACK_ENVIRONMENT: z.enum(["dev", "prod"]),
  SES_FEEDBACK_SECRET_ID: z.string(),
  SES_FEEDBACK_TOPIC_ARN: z.string(),
}).strict().superRefine((value, ctx) => {
  if (value.SES_FEEDBACK_SECRET_ID !== `byus/notification/${value.SES_FEEDBACK_ENVIRONMENT}`)
    ctx.addIssue({ code: "custom", path: ["SES_FEEDBACK_SECRET_ID"], message: "secret must match its environment" });
  if (value.SES_FEEDBACK_TOPIC_ARN !== `arn:aws:sns:ap-northeast-2:${ACCOUNT}:byus-ses-feedback-${value.SES_FEEDBACK_ENVIRONMENT}`)
    ctx.addIssue({ code: "custom", path: ["SES_FEEDBACK_TOPIC_ARN"], message: "topic must match its environment" });
});

const snsEvent = z.object({
  Records: z.array(z.object({
    Sns: z.object({ MessageId: z.string().min(1).max(200), TopicArn: z.string(), Message: z.string() }),
  })).min(1),
});

const address = z.string().max(320);
const recipientList = z.array(z.object({ emailAddress: address })).max(50);
const timestamp = z.string().max(40);
const sesEvent = z.object({
  eventType: z.string(),
  mail: z.object({
    messageId: z.string().min(1).max(200),
    timestamp,
    destination: z.array(address).max(50).default([]),
    tags: z.record(z.string(), z.array(z.string())).optional(),
  }),
  bounce: z.object({ bounceType: z.string().max(40), bounceSubType: z.string().max(60), bouncedRecipients: recipientList, timestamp }).optional(),
  complaint: z.object({
    complainedRecipients: recipientList, timestamp,
    complaintFeedbackType: z.string().max(60).optional(), complaintSubType: z.string().max(60).nullish(),
  }).optional(),
  delivery: z.object({ recipients: z.array(address).max(50), timestamp }).optional(),
  deliveryDelay: z.object({ delayType: z.string().max(60), delayedRecipients: recipientList, timestamp }).optional(),
  reject: z.object({ reason: z.string().max(60) }).optional(),
});

const EVENT_TYPES = {
  Send: "send", Delivery: "delivery", Bounce: "bounce",
  Complaint: "complaint", DeliveryDelay: "delivery_delay", Reject: "reject",
} as const;

export type SesFeedbackPayload = {
  sns_message_id: string;
  event_type: (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];
  ses_message_id: string;
  delivery_id: string | null;
  occurred_at: string;
  recipients: string[];
  bounce_type: string | null;
  bounce_sub_type: string | null;
  complaint_feedback_type: string | null;
  complaint_sub_type: string | null;
  delay_type: string | null;
  reject_reason: string | null;
};

// Returns null for event types the configuration set should not publish
// (Open, Click, ...); retrying those would never succeed.
export function toSesFeedbackPayload(snsMessageId: string, message: string): SesFeedbackPayload | null {
  const event = sesEvent.parse(JSON.parse(message));
  if (!Object.hasOwn(EVENT_TYPES, event.eventType)) return null;
  const type = EVENT_TYPES[event.eventType as keyof typeof EVENT_TYPES];
  const detail = { send: undefined, delivery: event.delivery, bounce: event.bounce, complaint: event.complaint, delivery_delay: event.deliveryDelay, reject: event.reject }[type];
  if (type !== "send" && detail === undefined) throw new Error("SES_FEEDBACK_EVENT_INVALID");
  const recipients =
    type === "bounce" ? event.bounce!.bouncedRecipients.map(r => r.emailAddress)
    : type === "complaint" ? event.complaint!.complainedRecipients.map(r => r.emailAddress)
    : type === "delivery_delay" ? event.deliveryDelay!.delayedRecipients.map(r => r.emailAddress)
    : type === "delivery" ? event.delivery!.recipients
    : event.mail.destination;
  const deliveryId = event.mail.tags?.delivery_id?.[0];
  return {
    sns_message_id: snsMessageId,
    event_type: type,
    ses_message_id: event.mail.messageId,
    delivery_id: deliveryId && /^[A-Za-z0-9_-]{1,256}$/.test(deliveryId) ? deliveryId : null,
    occurred_at: (detail && "timestamp" in detail ? detail.timestamp : undefined) ?? event.mail.timestamp,
    recipients,
    bounce_type: event.bounce?.bounceType ?? null,
    bounce_sub_type: event.bounce?.bounceSubType ?? null,
    complaint_feedback_type: event.complaint?.complaintFeedbackType ?? null,
    complaint_sub_type: event.complaint?.complaintSubType ?? null,
    delay_type: event.deliveryDelay?.delayType ?? null,
    reject_reason: event.reject?.reason ?? null,
  };
}

export function createSesFeedbackHandler(
  deps: {
    loadSecret(id: string): Promise<string>;
    createClient?(env: BenefitMaintenanceEnv): Pick<WorkerDataClient, "rpc">;
  },
  source: Record<string, string | undefined>,
) {
  const config = lambdaConfig.parse({
    SES_FEEDBACK_ENVIRONMENT: source.SES_FEEDBACK_ENVIRONMENT,
    SES_FEEDBACK_SECRET_ID: source.SES_FEEDBACK_SECRET_ID,
    SES_FEEDBACK_TOPIC_ARN: source.SES_FEEDBACK_TOPIC_ARN,
  });
  const createClient = deps.createClient ?? ((env: BenefitMaintenanceEnv) => createWorkerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000) }) },
  }));
  let client: Promise<Pick<WorkerDataClient, "rpc">> | undefined;
  const getClient = () => client ??= deps.loadSecret(config.SES_FEEDBACK_SECRET_ID)
    .then(secret => createClient(parseBenefitMaintenanceEnv(JSON.parse(secret) as NodeJS.ProcessEnv)))
    .catch(error => { client = undefined; throw error; });

  return async (event: unknown) => {
    const { Records } = snsEvent.parse(event);
    if (Records.some(record => record.Sns.TopicArn !== config.SES_FEEDBACK_TOPIC_ARN))
      throw new Error("SES_FEEDBACK_TOPIC_MISMATCH");
    let recorded = 0, skipped = 0;
    for (const { Sns } of Records) {
      const payload = toSesFeedbackPayload(Sns.MessageId, Sns.Message);
      if (!payload) { skipped++; continue; }
      const { error } = await (await getClient()).rpc("record_ses_email_event", { p_event: payload });
      // Throwing hands the event back to Lambda's async retry and then the
      // failure queue; nothing is acknowledged before the database has it.
      if (error) throw new Error("SES_FEEDBACK_DB_FAILED");
      recorded++;
    }
    console.info(JSON.stringify({ event: "ses_feedback", environment: config.SES_FEEDBACK_ENVIRONMENT, recorded, skipped }));
    return { recorded, skipped };
  };
}
