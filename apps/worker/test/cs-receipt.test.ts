import { expect, it } from "vitest";
import { renderCsReceipt } from "../src/business-inquiry-email.js";

it.each([["ko", "문의를 접수했어요"], ["en", "We’ve received your inquiry"]] as const)("renders the %s receipt", (locale, heading) => {
  const mail = renderCsReceipt({ id: "123", locale, body: "<example> " + "a".repeat(80) });
  expect(mail.subject).toContain(heading + " (#123)");
  expect(mail.html).toContain("&lt;example&gt;");
  expect(mail.text).toContain("…");
  expect(mail.text).not.toContain("a".repeat(60));
});
