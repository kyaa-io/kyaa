import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSesFeedbackHandler, toSesFeedbackPayload } from "../src/ses-feedback.js";

// Shapes follow the SES event publishing examples:
// https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-examples.html
const DELIVERY_ID = "8d4f1c2e-1b7a-4c3d-9e8f-0a1b2c3d4e5f";
const TOPIC = "arn:aws:sns:ap-northeast-2:996702758024:byus-ses-feedback-prod";
const mail = (extra: Record<string, unknown> = {}) => ({
  timestamp: "2026-11-15T00:40:02.012Z",
  source: "kyaa <notifications@kyaa.io>",
  sourceArn: "arn:aws:ses:ap-northeast-2:996702758024:identity/kyaa.io",
  sendingAccountId: "996702758024",
  messageId: "0100019a-ses-message-000000",
  destination: ["fan@example.com"],
  headersTruncated: false,
  headers: [{ name: "Subject", value: "private subject" }],
  commonHeaders: { subject: "private subject" },
  tags: { "ses:configuration-set": ["byus-notification-prod"], delivery_id: [DELIVERY_ID], env: ["prod"] },
  ...extra,
});
const events = {
  bounce: { eventType: "Bounce", mail: mail(), bounce: { bounceType: "Permanent", bounceSubType: "General", bouncedRecipients: [{ emailAddress: "fan@example.com", action: "failed", status: "5.1.1", diagnosticCode: "smtp; 550 5.1.1 user unknown" }], timestamp: "2026-11-15T00:41:02.669Z", feedbackId: "feedback", reportingMTA: "dsn; mta.example.com" } },
  suppressed: { eventType: "Bounce", mail: mail(), bounce: { bounceType: "Permanent", bounceSubType: "OnAccountSuppressionList", bouncedRecipients: [{ emailAddress: "fan@example.com" }], timestamp: "2026-11-15T00:41:03.000Z", feedbackId: "feedback" } },
  complaint: { eventType: "Complaint", mail: mail(), complaint: { complainedRecipients: [{ emailAddress: "fan@example.com" }], timestamp: "2026-11-15T00:41:02.669Z", feedbackId: "feedback", userAgent: "Mozilla/5.0", complaintFeedbackType: "abuse", arrivalDate: "2026-11-15T00:41:02.669Z" } },
  delivery: { eventType: "Delivery", mail: mail(), delivery: { timestamp: "2026-11-15T00:41:04.133Z", processingTimeMillis: 11893, recipients: ["fan@example.com"], smtpResponse: "250 2.6.0 Message received", remoteMtaIp: "192.0.2.1", reportingMTA: "mta.example.com" } },
  delay: { eventType: "DeliveryDelay", mail: mail(), deliveryDelay: { timestamp: "2026-11-15T00:45:40.095Z", delayType: "MailboxFull", expirationTime: "2026-11-15T12:45:40.914Z", delayedRecipients: [{ emailAddress: "fan@example.com", status: "4.2.2", diagnosticCode: "smtp; 452 4.2.2 mailbox full" }] } },
  send: { eventType: "Send", mail: mail(), send: {} },
  reject: { eventType: "Reject", mail: mail(), reject: { reason: "Bad content" } },
};
const record = (message: unknown, extra: Record<string, unknown> = {}) => ({
  EventSource: "aws:sns", EventVersion: "1.0", EventSubscriptionArn: `${TOPIC}:sub`,
  Sns: { Type: "Notification", MessageId: "sns-1", TopicArn: TOPIC, Subject: null, Message: JSON.stringify(message), Timestamp: "2026-11-15T00:41:05.000Z", SignatureVersion: "1", Signature: "sig", MessageAttributes: {}, ...extra },
});
const source = { SES_FEEDBACK_ENVIRONMENT: "prod", SES_FEEDBACK_SECRET_ID: "byus/notification/prod", SES_FEEDBACK_TOPIC_ARN: TOPIC };
const secret = JSON.stringify({ POSTGREST_URL: "https://data.kyaa.io/", POSTGREST_SERVICE_TOKEN: "t".repeat(40), WEB_PUSH_VAPID_SUBJECT: "mailto:x@kyaa.io" });

function setup(rpcResult: { error: unknown } = { error: null }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  const loadSecret = vi.fn().mockResolvedValue(secret);
  const createClient = vi.fn().mockReturnValue({ rpc });
  return { rpc, loadSecret, createClient, handler: createSesFeedbackHandler({ loadSecret, createClient }, source) };
}

beforeEach(() => { vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); });

describe("SES feedback payload", () => {
  it.each([
    ["bounce", { event_type: "bounce", bounce_type: "Permanent", bounce_sub_type: "General", occurred_at: "2026-11-15T00:41:02.669Z" }],
    ["suppressed", { event_type: "bounce", bounce_type: "Permanent", bounce_sub_type: "OnAccountSuppressionList" }],
    ["complaint", { event_type: "complaint", complaint_feedback_type: "abuse", complaint_sub_type: null }],
    ["delivery", { event_type: "delivery", occurred_at: "2026-11-15T00:41:04.133Z" }],
    ["delay", { event_type: "delivery_delay", delay_type: "MailboxFull" }],
    ["send", { event_type: "send", occurred_at: "2026-11-15T00:40:02.012Z" }],
    ["reject", { event_type: "reject", reject_reason: "Bad content" }],
  ] as const)("maps %s with the delivery tag and recipient only", (name, expected) => {
    const payload = toSesFeedbackPayload("sns-1", JSON.stringify(events[name]));
    expect(payload).toMatchObject({ sns_message_id: "sns-1", ses_message_id: "0100019a-ses-message-000000", delivery_id: DELIVERY_ID, recipients: ["fan@example.com"], ...expected });
    const serialized = JSON.stringify(payload);
    for (const hidden of ["private subject", "diagnostic", "smtp;", "550", "Mozilla", "192.0.2.1", "notifications@kyaa.io", "\"feedback\""])
      expect(serialized).not.toContain(hidden);
  });

  it("keeps unmatched mail (no delivery tag) and drops an invalid tag value", () => {
    expect(toSesFeedbackPayload("sns-1", JSON.stringify({ ...events.bounce, mail: mail({ tags: { "ses:configuration-set": ["byus-notification-prod"] } }) }))?.delivery_id).toBeNull();
    expect(toSesFeedbackPayload("sns-1", JSON.stringify({ ...events.bounce, mail: mail({ tags: { delivery_id: ["a b"] } }) }))?.delivery_id).toBeNull();
  });

  it("ignores unpublished event types and rejects events missing their detail", () => {
    expect(toSesFeedbackPayload("sns-1", JSON.stringify({ eventType: "Open", mail: mail(), open: {} }))).toBeNull();
    expect(() => toSesFeedbackPayload("sns-1", JSON.stringify({ eventType: "Bounce", mail: mail() }))).toThrow("SES_FEEDBACK_EVENT_INVALID");
    expect(() => toSesFeedbackPayload("sns-1", "not json")).toThrow();
  });
});

describe("SES feedback handler", () => {
  it("records each SNS message once and loads the secret once per container", async () => {
    const { rpc, loadSecret, createClient, handler } = setup();
    await expect(handler({ Records: [record(events.bounce)] })).resolves.toEqual({ recorded: 1, skipped: 0 });
    await handler({ Records: [record(events.delivery, { MessageId: "sns-2" })] });
    expect(loadSecret).toHaveBeenCalledExactlyOnceWith("byus/notification/prod");
    expect(createClient).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ POSTGREST_URL: "https://data.kyaa.io/" }));
    expect(rpc).toHaveBeenNthCalledWith(1, "record_ses_email_event", { p_event: expect.objectContaining({ sns_message_id: "sns-1", event_type: "bounce" }) });
    expect(rpc).toHaveBeenNthCalledWith(2, "record_ses_email_event", { p_event: expect.objectContaining({ sns_message_id: "sns-2", event_type: "delivery" }) });
    expect(JSON.stringify((console.info as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("fan@example.com");
  });

  it("throws on a database error so Lambda retries and then parks the event", async () => {
    const { handler } = setup({ error: { message: "connection reset" } });
    await expect(handler({ Records: [record(events.complaint)] })).rejects.toThrow("SES_FEEDBACK_DB_FAILED");
  });

  // SNS invokes Lambda asynchronously; Lambda runs a failing event 3 times in
  // total (2 retries) and then sends an invocation record whose requestPayload
  // is this same SNS event to the on-failure queue. The handler must reject on
  // every attempt so nothing is acknowledged, and a later replay of that
  // payload must record the same SNS message id once the database is back.
  it("never acknowledges a bounce or complaint while the database keeps failing, and records it on replay", async () => {
    const { rpc, handler } = setup({ error: { message: "connection reset" } });
    for (const event of [{ Records: [record(events.bounce)] }, { Records: [record(events.complaint, { MessageId: "sns-2" })] }]) {
      for (let attempt = 1; attempt <= 3; attempt++) await expect(handler(event)).rejects.toThrow("SES_FEEDBACK_DB_FAILED");
    }
    expect(rpc).toHaveBeenCalledTimes(6);
    expect(new Set(rpc.mock.calls.map(([, args]) => args.p_event.sns_message_id))).toEqual(new Set(["sns-1", "sns-2"]));
    expect(console.info).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ error: null });
    const parked = { requestContext: { condition: "RetriesExhausted", approximateInvokeCount: 3 }, requestPayload: { Records: [record(events.bounce)] } };
    await expect(handler(parked.requestPayload)).resolves.toEqual({ recorded: 1, skipped: 0 });
    expect(rpc).toHaveBeenLastCalledWith("record_ses_email_event", { p_event: expect.objectContaining({ sns_message_id: "sns-1", event_type: "bounce", bounce_type: "Permanent" }) });
  });

  it("does not record a later record in the same invocation after an earlier one fails", async () => {
    const { rpc, handler } = setup();
    rpc.mockResolvedValueOnce({ error: { message: "timeout" } });
    await expect(handler({ Records: [record(events.bounce), record(events.complaint, { MessageId: "sns-2" })] })).rejects.toThrow("SES_FEEDBACK_DB_FAILED");
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("refuses another topic before touching the database", async () => {
    const { rpc, loadSecret, handler } = setup();
    await expect(handler({ Records: [record(events.bounce, { TopicArn: "arn:aws:sns:ap-northeast-2:996702758024:other" })] })).rejects.toThrow("SES_FEEDBACK_TOPIC_MISMATCH");
    expect(loadSecret).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("skips unpublished types without a database call", async () => {
    const { rpc, handler } = setup();
    await expect(handler({ Records: [record({ eventType: "Click", mail: mail(), click: {} })] })).resolves.toEqual({ recorded: 0, skipped: 1 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("retries the secret after a failed load", async () => {
    const { loadSecret, handler } = setup();
    loadSecret.mockRejectedValueOnce(new Error("throttled"));
    await expect(handler({ Records: [record(events.send)] })).rejects.toThrow("throttled");
    await expect(handler({ Records: [record(events.send)] })).resolves.toEqual({ recorded: 1, skipped: 0 });
    expect(loadSecret).toHaveBeenCalledTimes(2);
  });

  it.each([
    { ...source, SES_FEEDBACK_SECRET_ID: "byus/notification/dev" },
    { ...source, SES_FEEDBACK_TOPIC_ARN: "arn:aws:sns:ap-northeast-2:996702758024:byus-ses-feedback-dev" },
    { ...source, SES_FEEDBACK_ENVIRONMENT: "staging" },
  ])("rejects a mismatched Lambda configuration %#", (bad) => {
    expect(() => createSesFeedbackHandler({ loadSecret: vi.fn() }, bad)).toThrow();
  });
});
