import type { SendEmailCommandInput } from "@aws-sdk/client-sesv2";
import { expect, it } from "vitest";
import { drainChemiMail } from "./chemi-mail-worker.js";

it("sends the consent result notice as a non-advertising mail that links to settings", async () => {
  const inbox: SendEmailCommandInput[] = [];
  const queue: unknown[] = [{
    id: "11111111-1111-4111-8111-111111111111", token: "22222222-2222-4222-8222-222222222222",
    kind: "marketing_consent", destination: "member@example.com", advertising: false,
    body: "[kyaa] 수신 동의 처리 결과\n전송자: 주식회사 셀리랩(kyaa)\n처리 일시: 2026-11-25 18:00:00 KST\n처리 내용: 이벤트·혜택 안내 이메일 수신 동의",
  }];
  const finished: Array<Record<string, unknown>> = [];
  const sent = await drainChemiMail(async (name, args) => {
    if (name === "chemi_mail_claim") return queue.shift() ?? null;
    finished.push(args);
    return true;
  }, {
    region: "ap-northeast-2", fromEmail: "notifications@kyaa.io",
    trustedOrigin: "https://dev.kyaa.io", unsubscribeSecret: "unit-test-only".repeat(4),
  }, "test_sink", { async send(command) { inbox.push(command.input); return { MessageId: "fixture" }; } });

  expect(sent).toBe(1);
  expect(finished).toEqual([expect.objectContaining({ p_sent: true })]);
  const simple = inbox[0]!.Content!.Simple!;
  expect(simple.Subject!.Data).toBe("[kyaa] 수신 동의 처리 결과");
  expect(simple.Subject!.Data).not.toContain("광고");
  const text = simple.Body!.Text!.Data!;
  expect(text).toContain("전송자: 주식회사 셀리랩(kyaa)");
  expect(text).toContain("처리 일시: 2026-11-25 18:00:00 KST");
  expect(text).toContain("처리 내용: 이벤트·혜택 안내 이메일 수신 동의");
  expect(text).toContain("/settings");
  expect(text).not.toContain("/chemi");
});
