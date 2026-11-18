import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import type { SendEmailCommandInput } from "@aws-sdk/client-sesv2";
import { expect, it } from "vitest";
import { drainChemiMail } from "./chemi-mail-worker.js";

const sql = (query: string) => execFileSync("psql", ["-XAtq", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
const literal = (value: unknown) => value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;

it.skipIf(process.env.PGDATABASE !== "byus_clean")("drains Chemi fixtures into the shared SES envelope with current marketing consent", async () => {
  const inbox: SendEmailCommandInput[] = [];
  const count = await drainChemiMail(async (name, args) => {
    const result = sql(`select to_jsonb(public.${name}(${Object.values(args).map(literal).join(",")}))`);
    return result ? JSON.parse(result) as unknown : null;
  }, {
    region: "ap-northeast-2", fromEmail: "notifications@kyaa.io",
    trustedOrigin: "https://dev.kyaa.io", unsubscribeSecret: "integration-test-only".repeat(3),
  }, "test_sink", {
    async send(command) {
      inbox.push(command.input);
      return { MessageId: "fixture" };
    },
  });

  expect(count).toBe(9);
  expect(sql("select count(*) from public.chemi_mail_test_sink")).toBe("9");
  expect(sql("select count(*) from public.chemi_mail_outbox where kind='lucky_draw' and status='cancelled'")).toBe("1");
  let advertisementCount = 0;
  const evidence = inbox.map((message) => {
    const simple = message.Content!.Simple!;
    const subject = simple.Subject!.Data!;
    const body = simple.Body!.Text!.Data!;
    const html = simple.Body!.Html!.Data!;
    const consent = message.Destination!.ToAddresses![0] === "true@example.invalid";
    const transaction = /영수증|환불/.test(subject);
    const ad = consent && !transaction;
    if (ad) advertisementCount++;
    expect(subject.startsWith("(광고) ")).toBe(ad);
    for (const rendered of [body, html]) {
      expect(rendered.includes("럭키드로우")).toBe(ad);
      expect(rendered.includes("support@kyaa.io")).toBe(ad);
      expect(rendered.includes("/email/unsubscribe?t=")).toBe(ad);
    }
    expect(simple.Headers?.some((header) => header.Name === "List-Unsubscribe-Post") ?? false).toBe(ad);
    return { consent, subject, body: body.replace(/t=[^&\s]+/g, "t=[redacted]") };
  });
  expect(advertisementCount).toBe(3);

  const binding = sql(`select public.email_unsubscribe_destination_binding(id,to_hash)
    from public.chemi_mail_outbox where kind='lucky_draw' and status='sent'`);
  expect(sql(`select public.apply_email_unsubscribe(id,'chemi_lucky_draw','activity',null,false,
     now(),${literal(binding)},'one_click')->>'enabled'
    from public.chemi_mail_outbox where kind='lucky_draw' and status='sent'`)).toBe("false");
  expect(sql(`select marketing_notifications from public.notification_preferences p
    join public.app_users u on u.id=p.app_user_id where u.verified_email='true@example.invalid'`)).toBe("f");

  if (process.env.CHEMI_TEST_EVIDENCE) {
    writeFileSync(process.env.CHEMI_TEST_EVIDENCE, JSON.stringify(evidence, null, 2) + "\n");
  }
});
