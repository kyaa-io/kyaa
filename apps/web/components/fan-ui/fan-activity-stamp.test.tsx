import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FanActivityStamp } from "./fan-activity-stamp";

afterEach(cleanup);

it("shows the ink stamp of the fan action as a hidden picture", () => {
  const { container } = render(<><FanActivityStamp kind="comment" /><FanActivityStamp kind="invite" size="sm" /></>);
  const [comment, invite] = [...container.querySelectorAll("img")];
  expect(comment).toHaveAttribute("src", "/images/stamps/ink-v1/first-comment.webp");
  expect(comment).toHaveAttribute("data-art", "stamp");
  expect(comment).toHaveAttribute("aria-hidden", "true");
  expect(invite).toHaveAttribute("src", "/images/stamps/ink-v1/invite.webp");
  expect(invite).toHaveAttribute("data-fan-activity-stamp", "invite");
});
