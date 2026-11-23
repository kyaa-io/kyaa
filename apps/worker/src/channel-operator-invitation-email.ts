import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { z } from "zod";
import { kyaaMailFooter } from "./business-inquiry-email.js";
import { createWorkerClient } from "./data-client.js";
import { sesFeedbackFields, type SesFeedbackConfig, type SesV2SendClient } from "./adapters/ses-email-sender.js";
import type { NotificationWorkerEnv } from "./notification-env.js";

const jobSchema = z.object({
  id: z.uuid(),
  email: z.email().max(254),
  locale: z.enum(["ko", "en"]),
  origin: z.enum(["https://dev.kyaa.io", "https://kyaa.io"]),
  expiresAt: z.iso.datetime({ offset: true }),
  channelName: z.string().min(1).max(100),
}).strict();
export type ChannelOperatorInvitationJob = z.infer<typeof jobSchema>;

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);

function block(locale: "ko" | "en", job: ChannelOperatorInvitationJob) {
  const ko = locale === "ko";
  const until = new Intl.DateTimeFormat(ko ? "ko-KR" : "en-US", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(new Date(job.expiresAt));
  // The sign-in link is an authentication entry: no UTM and no click tracking.
  const link = `${job.origin}/login?locale=${locale}`;
  const heading = ko ? `${job.channelName} 페이지 운영자 초대` : `Invitation to manage ${job.channelName}`;
  const lines = ko
    ? [`kyaa 관리자가 ${job.email} 주소를 ${job.channelName} 페이지 운영자로 지정했어요.`,
      `이 이메일 주소로 kyaa에 가입하거나 로그인하면 ${job.channelName} 페이지의 공지와 일정을 관리할 수 있어요. 다른 이메일로 가입하면 운영자로 지정되지 않아요.`,
      `초대는 ${until}까지 유효해요.`]
    : [`A kyaa administrator named ${job.email} as an operator of the ${job.channelName} page.`,
      `Sign up or sign in to kyaa with this email address to manage notices and schedules on the ${job.channelName} page. Signing up with a different email does not make you an operator.`,
      `This invitation is valid until ${until}.`];
  const action = ko ? "kyaa 가입하기" : "Sign up for kyaa";
  return {
    heading,
    text: [heading, ...lines, `${action} · ${link}`].join("\n\n"),
    html: `<section lang="${locale}"><h1 style="font-size:22px;line-height:1.4">${escapeHtml(heading)}</h1>${lines.map((line) => `<p style="overflow-wrap:anywhere">${escapeHtml(line)}</p>`).join("")}<p><a data-outbound-tracking="off" style="display:inline-block;padding:12px 20px;background:#d946bf;color:white;border-radius:8px;text-decoration:none;font-weight:700" href="${escapeHtml(link)}">${action}</a></p></section>`,
  };
}

/** One mail in both languages, the invitation's language first. */
export function renderChannelOperatorInvitationEmail(job: ChannelOperatorInvitationJob) {
  const second = job.locale === "ko" ? "en" : "ko";
  const first = block(job.locale, job);
  const other = block(second, job);
  const footer = kyaaMailFooter(job.locale, "operator_invitation");
  const subject = `[kyaa] ${first.heading}`;
  return {
    subject,
    text: [first.text, other.text, footer.text].join("\n\n"),
    html: `<main lang="${job.locale}" style="max-width:560px;margin:32px auto;padding:24px;font:16px/1.6 Arial,sans-serif;color:#242124"><strong>kyaa</strong>${first.html}<hr>${other.html}${footer.html}</main>`,
  };
}

type Rpc = { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

/** Claim one queued invitation of this environment, send it once, record the outcome. */
export async function sendChannelOperatorInvitationOnce(db: Rpc, origin: "https://dev.kyaa.io" | "https://kyaa.io", fromEmail: string, client: SesV2SendClient, feedback?: SesFeedbackConfig) {
  const claimed = await db.rpc("claim_channel_operator_invitation_email", { p_origin: origin });
  if (claimed.error) throw new Error("OPERATOR_INVITATION_QUEUE_UNAVAILABLE");
  if (claimed.data === null) return 0;
  const parsed = jobSchema.safeParse(claimed.data);
  // The row is already marked sending; a malformed job is closed as failed and never retried.
  if (!parsed.success || parsed.data.origin !== origin) {
    const id = z.object({ id: z.uuid() }).safeParse(claimed.data);
    if (id.success) await db.rpc("finish_channel_operator_invitation_email", { p_id: id.data.id, p_outcome: "failed" });
    throw new Error("OPERATOR_INVITATION_JOB_INVALID");
  }
  const mail = renderChannelOperatorInvitationEmail(parsed.data);
  let messageId: string | undefined;
  try {
    messageId = (await client.send(new SendEmailCommand({
      FromEmailAddress: fromEmail,
      Destination: { ToAddresses: [parsed.data.email] },
      ...sesFeedbackFields(feedback),
      Content: { Simple: { Subject: { Data: mail.subject, Charset: "UTF-8" }, Body: { Text: { Data: mail.text, Charset: "UTF-8" }, Html: { Data: mail.html, Charset: "UTF-8" } } } },
    }))).MessageId;
  } catch {
    await db.rpc("finish_channel_operator_invitation_email", { p_id: parsed.data.id, p_outcome: "failed" });
    throw new Error("OPERATOR_INVITATION_SEND_FAILED");
  }
  const outcome = typeof messageId === "string" && messageId.trim() && messageId.length <= 200
    ? { p_outcome: "sent", p_provider_id: messageId } : { p_outcome: "failed" };
  const finished = await db.rpc("finish_channel_operator_invitation_email", { p_id: parsed.data.id, ...outcome });
  if (finished.error) throw new Error("OPERATOR_INVITATION_QUEUE_UNAVAILABLE");
  return outcome.p_outcome === "sent" ? 1 : 0;
}

export async function runChannelOperatorInvitationEmailOnce(env: NotificationWorkerEnv, client?: SesV2SendClient, feedback?: SesFeedbackConfig) {
  if (env.OPERATOR_INVITATION_EMAIL_MODE !== "ses_email") return 0;
  const environment = env.NOTIFICATION_EXTERNAL_ENVIRONMENT;
  if (environment !== "dev" && environment !== "prod") throw new Error("OPERATOR_INVITATION_ENVIRONMENT_INVALID");
  const db = createWorkerClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env);
  return sendChannelOperatorInvitationOnce(db, environment === "dev" ? "https://dev.kyaa.io" : "https://kyaa.io", env.SES_FROM_EMAIL!,
    client ?? new SESv2Client({ region: env.SES_REGION!, maxAttempts: 1 }), feedback);
}
