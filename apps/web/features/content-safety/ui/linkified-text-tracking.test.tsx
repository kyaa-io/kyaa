// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { trackOutboundLinks } from "@/features/analytics/client/outbound-link-tracker";
import { LinkifiedText } from "./linkified-text";

vi.mock("@/features/analytics/client/product-event-client", () => ({ recordProductEventV1: vi.fn().mockResolvedValue(true) }));
const stop: Array<() => void> = [];
afterEach(() => { stop.splice(0).forEach(done => done()); cleanup(); });

describe("body links and outbound tracking", () => {
  it("adds UTM after the existing query and keeps the hash, but leaves signed and download addresses alone", () => {
    const text = [
      "https://youtu.be/abc?t=3#top",
      "https://files.example.com/a.pdf?X-Amz-Signature=abc123&X-Amz-Expires=60",
      "https://files.example.com/download/report.pdf",
    ].join("\n");
    const { container } = render(<p><LinkifiedText text={text} locale="ko" /></p>);
    stop.push(trackOutboundLinks(document, "/community"));
    const hrefs = [...container.querySelectorAll("a")].map(anchor => anchor.getAttribute("href"));
    expect(hrefs[0]).toMatch(/^https:\/\/youtu\.be\/abc\?t=3&utm_source=kyaa&utm_medium=referral&utm_campaign=\w+&utm_content=content\.external#top$/);
    expect(hrefs[1]).toBe("https://files.example.com/a.pdf?X-Amz-Signature=abc123&X-Amz-Expires=60");
    expect(hrefs[2]).toBe("https://files.example.com/download/report.pdf");
    expect(container.querySelector("a")?.textContent).toContain("https://youtu.be/abc?t=3#top");
  });
});
