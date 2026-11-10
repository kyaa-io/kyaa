import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ReactionCount, ReactionIcon } from "./reaction-count";

afterEach(cleanup);

it("fills both reaction icons and keeps a like toggle soft until the viewer likes it", () => {
  const { container } = render(<><ReactionIcon kind="like" /><ReactionIcon kind="like" pressed={false} /><ReactionIcon kind="comment" /></>);
  const [like, soft, comment] = [...container.querySelectorAll("svg")];
  for (const icon of [like, soft, comment]) expect(icon).toHaveAttribute("fill", "currentColor");
  expect(like).toHaveAttribute("data-reaction", "like");
  expect(like).not.toHaveAttribute("data-pressed");
  expect(soft).toHaveAttribute("data-pressed", "false");
  expect(comment).toHaveAttribute("data-reaction", "comment");
});

it("marks only a zero count as zero and formats the number for the locale", () => {
  const { container } = render(<><ReactionCount value={0} locale="ko" /><ReactionCount value={1234} locale="ko" /></>);
  const [zero, many] = [...container.querySelectorAll("span")];
  expect(zero).toHaveAttribute("data-zero", "true");
  expect(zero).toHaveTextContent("0");
  expect(many).not.toHaveAttribute("data-zero");
  expect(many).toHaveTextContent("1,234");
});
