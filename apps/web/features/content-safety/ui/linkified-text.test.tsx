import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LinkifiedText } from "./linkified-text";

afterEach(cleanup);

describe("LinkifiedText", () => {
  it("shows a user's web address as a new-window link without changing the text", () => {
    const url = "https://www.instagram.com/p/DfJw9D7ha--/";
    const { container } = render(<p><LinkifiedText locale="ko" text={`보세요\n${url}`} /></p>);
    const link = screen.getByRole("link", { name: `${url}, 새 창` });
    expect(link).toHaveAttribute("href", url);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow ugc");
    expect(link).toHaveAttribute("data-outbound-placement", "content");
    expect(container.querySelector("p")?.firstChild?.textContent).toBe("보세요\n");
  });
  it("renders plain text as is and drops nofollow for official text", () => {
    const { container } = render(<p><LinkifiedText locale="en" text="링크 없음" /></p>);
    expect(container.innerHTML).toBe("<p>링크 없음</p>");
    cleanup();
    render(<p><LinkifiedText locale="en" official text="https://example.com/a" /></p>);
    expect(screen.getByRole("link")).toHaveAttribute("rel", "noopener noreferrer");
  });
});
