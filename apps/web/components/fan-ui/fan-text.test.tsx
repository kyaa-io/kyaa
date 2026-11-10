import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FanText } from "./fan-text";

afterEach(cleanup);

it("renders each role with its data attribute and the chosen tag", () => {
  const { container } = render(<><FanText role="item" as="strong">이름</FanText><FanText role="meta" as="time" dateTime="2026-11-10">11. 10.</FanText><FanText role="body" as="p">본문</FanText></>);
  expect(container.querySelector("strong")).toHaveAttribute("data-fan-text", "item");
  expect(container.querySelector("time")).toHaveAttribute("data-fan-text", "meta");
  expect(container.querySelector("p")).toHaveAttribute("data-fan-text", "body");
});

it("defaults to a span and merges a caller class", () => {
  const { container } = render(<FanText role="label" className="x">라벨</FanText>);
  expect(container.firstElementChild?.tagName).toBe("SPAN");
  expect(container.firstElementChild?.className).toContain("x");
});
