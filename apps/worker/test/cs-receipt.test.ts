import { expect, it, vi } from "vitest";
import { renderCsReceipt } from "../src/business-inquiry-email.js";

it.each([["ko", "문의를 접수했어요"], ["en", "We’ve received your inquiry"]] as const)("renders the %s receipt", (locale, heading) => {
  const mail = renderCsReceipt({ id: "3e59932f-aaaa-4000-8000-000000000001", locale, body: "<example> " + "a".repeat(80) });
  expect(mail.subject).toContain(heading + " (#3E59932F)");
  expect(mail.html).toContain("&lt;example&gt;");
  expect(mail.text).toContain("…");
  expect(mail.text).not.toContain("a".repeat(60));
});

const rpc = vi.hoisted(() => vi.fn());
vi.mock("../src/data-client.js", () => ({ createWorkerClient: () => ({ rpc }) }));
import { runCsReceipt } from "../src/cs-receipt.js";
import type { NotificationWorkerEnv } from "../src/notification-env.js";

it("validates the queued receipt before sending its localized SES message", async () => {
  const job = { id: "3e59932f-aaaa-4000-8000-000000000001", email: "fan@example.org", locale: "en", body: "문의 예시" } as const;
  const env = { SES_FROM_EMAIL: "notifications@kyaa.io" } as NotificationWorkerEnv;
  const client = { send: vi.fn() };
  rpc.mockResolvedValueOnce({ data: { ...job, locale: "invalid" } });
  await expect(runCsReceipt(env, client)).rejects.toThrow();
  expect(client.send).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({ data: job });
  expect(await runCsReceipt(env, client)).toBe(1);
  expect(rpc).toHaveBeenCalledWith("consume_cs_receipt");
  const mail = renderCsReceipt(job);
  expect(client.send.mock.calls[0]?.[0].input).toMatchObject({
    FromEmailAddress: env.SES_FROM_EMAIL,
    Destination: { ToAddresses: [job.email] },
    Content: { Simple: { Subject: { Data: mail.subject }, Body: { Text: { Data: mail.text }, Html: { Data: mail.html } } } },
  });
});
