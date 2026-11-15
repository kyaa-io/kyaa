import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toSesFeedbackPayload } from "../src/ses-feedback.js";

// The SES feedback Lambda and record_ses_email_event meet here. Every payload below is the real output of
// toSesFeedbackPayload for an AWS documentation example; supabase/tests/ses_feedback_worker_contract.sql
// feeds the same file to the real database function. Regenerate after a deliberate change with
// SES_FEEDBACK_FIXTURE_WRITE=1 npx vitest run test/ses-feedback-db-contract.test.ts
const FIXTURE = new URL("../../../supabase/tests/fixtures/ses_feedback_worker_payloads.json", import.meta.url);

// https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-examples.html
const awsMail = (timestamp: string) => ({
  timestamp,
  source: "Sender Name <sender@example.com>",
  sourceArn: "arn:aws:ses:us-east-1:123456789012:identity/sender@example.com",
  sendingAccountId: "123456789012",
  messageId: "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000",
  destination: ["recipient@example.com"],
  headersTruncated: false,
  headers: [
    { name: "From", value: "Sender Name <sender@example.com>" },
    { name: "To", value: "recipient@example.com" },
    { name: "Subject", value: "Message sent from Amazon SES" },
    { name: "MIME-Version", value: "1.0" },
  ],
  commonHeaders: { from: ["Sender Name <sender@example.com>"], to: ["recipient@example.com"], messageId: "EXAMPLE7c191be45-e9aedb9a-02f9-4d12-a87d-dd0099a07f8a-000000", subject: "Message sent from Amazon SES" },
  tags: { "ses:configuration-set": ["ConfigSet"], "ses:source-ip": ["192.0.2.0"], "ses:from-domain": ["example.com"], "ses:caller-identity": ["ses_user"] },
});
const awsBounce = {
  eventType: "Bounce",
  bounce: {
    bounceType: "Permanent", bounceSubType: "General",
    bouncedRecipients: [{ emailAddress: "recipient@example.com", action: "failed", status: "5.1.1", diagnosticCode: "smtp; 550 5.1.1 user unknown" }],
    timestamp: "2017-08-05T00:41:02.669Z", feedbackId: "01000157c44f053b-61b59c11-9236-11e6-8f96-7be8aexample-000000", reportingMTA: "dsn; mta.example.com",
  },
  mail: awsMail("2017-08-05T00:40:02.012Z"),
};
const awsDelivery = {
  eventType: "Delivery",
  mail: awsMail("2016-10-19T23:20:52.240Z"),
  delivery: { timestamp: "2016-10-19T23:21:04.133Z", processingTimeMillis: 11893, recipients: ["recipient@example.com"], smtpResponse: "250 2.6.0 Message received", remoteMtaIp: "123.456.789.012", reportingMTA: "mta.example.com" },
};
const awsSend = { eventType: "Send", mail: awsMail("2016-10-14T05:02:16.645Z"), send: {} };

type Example = { eventType: string; mail: ReturnType<typeof awsMail>; [detail: string]: unknown };
// Our sender adds the delivery_id tag (ses-email-sender.ts sesFeedbackFields); each case gets its own SES message id.
function ours(example: Example, deliveryId: string, messageId: string, patch: Record<string, unknown> = {}) {
  const event = structuredClone(example) as Example;
  event.mail.messageId = messageId;
  event.mail.tags = { ...event.mail.tags, delivery_id: [deliveryId], env: ["dev"] } as typeof event.mail.tags;
  return { ...event, ...patch };
}
const id = (n: number) => `5e5f0000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const soft = (at: string) => ({ bounce: { ...awsBounce.bounce, bounceType: "Transient", bounceSubType: "General", timestamp: at } });
const delivered = (at: string) => ({ delivery: { ...awsDelivery.delivery, timestamp: at } });

const cases: Record<string, [sns: string, event: unknown]> = {
  aws_bounce: ["sns-aws-bounce", ours(awsBounce, id(1), awsBounce.mail.messageId)],
  aws_delivery: ["sns-aws-delivery", ours(awsDelivery, id(2), "ses-delivery-2")],
  send_unknown_first: ["sns-send-a", ours(awsSend, id(3), "ses-send-3")],
  send_before_finish: ["sns-send-b", ours(awsSend, id(4), "ses-send-4")],
  send_replayed: ["sns-send-c", ours(awsSend, id(5), "ses-send-5")],
  // Tag of an in-flight send, message id of another send; tag of an accepted send, unknown message id.
  other_send_message_id: ["sns-other-id", ours(awsSend, id(7), "ses-send-4")],
  other_send_tag: ["sns-other-tag", ours(awsSend, id(6), "ses-not-ours")],
  reorder_a_bounce: ["sns-order-a", ours(awsBounce, id(8), "ses-order-a", soft("2026-11-16T00:00:01.000Z"))],
  reorder_b_delivery: ["sns-order-b", ours(awsDelivery, id(9), "ses-order-b", delivered("2026-11-16T00:00:02.000Z"))],
  reorder_c_bounce: ["sns-order-c", ours(awsBounce, id(10), "ses-order-c", soft("2026-11-16T00:00:03.000Z"))],
  reorder_d_bounce: ["sns-order-d", ours(awsBounce, id(11), "ses-order-d", soft("2026-11-16T00:00:04.000Z"))],
};

describe("SES feedback payloads handed to record_ses_email_event", () => {
  const generated = Object.fromEntries(Object.entries(cases).map(([name, [sns, event]]) => [name, toSesFeedbackPayload(sns, JSON.stringify(event))]));

  it("match the database contract fixture", () => {
    if (process.env.SES_FEEDBACK_FIXTURE_WRITE === "1") writeFileSync(FIXTURE, `${JSON.stringify(generated, null, 2)}\n`);
    expect(JSON.parse(readFileSync(FIXTURE, "utf8"))).toEqual(generated);
  });

  it("are the flat minimum, never the SES event", () => {
    for (const payload of Object.values(generated)) {
      expect(payload).not.toBeNull();
      expect(payload).not.toHaveProperty("message");
      expect(payload).not.toHaveProperty("snsMessageId");
      expect(JSON.stringify(payload)).not.toMatch(/diagnostic|smtp;|sender@example\.com|192\.0\.2\.0|Subject/);
    }
    expect(generated.aws_bounce).toMatchObject({ sns_message_id: "sns-aws-bounce", event_type: "bounce", delivery_id: id(1), bounce_type: "Permanent", recipients: ["recipient@example.com"] });
  });
});
