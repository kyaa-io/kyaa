import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { z } from "zod";
import { renderCsReceipt } from "./business-inquiry-email.js";
import { createWorkerClient } from "./data-client.js";
import { sesFeedbackFields, type SesFeedbackConfig, type SesV2SendClient } from "./adapters/ses-email-sender.js";
import type { NotificationWorkerEnv } from "./notification-env.js";

const receipt = z.object({id: z.uuid(), email: z.email(), locale: z.enum(["ko", "en"]), body: z.string()});

export async function runCsReceipt(env: NotificationWorkerEnv, client?: SesV2SendClient, feedback?: SesFeedbackConfig) {
  const db = createWorkerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env);
  const {data, error} = await db.rpc("consume_cs_receipt");
  if (error) throw new Error("CS_RECEIPT_QUEUE_UNAVAILABLE");
  if (!data) return 0;
  const job = receipt.parse(data);
  const mail = renderCsReceipt(job);
  const ses = client ?? new SESv2Client({region: env.SES_REGION!, maxAttempts: 1});
  await ses.send(new SendEmailCommand({
    FromEmailAddress: env.SES_FROM_EMAIL!,
    Destination: {ToAddresses: [job.email]},
    ...sesFeedbackFields(feedback),
    Content: {Simple: {Subject: {Data: mail.subject}, Body: {Text: {Data: mail.text}, Html: {Data: mail.html}}}},
  }));
  return 1;
}
