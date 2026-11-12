import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FanDisplay } from "./fan-display";

afterEach(cleanup);

it("renders the role as a data attribute on the chosen tag", () => {
  const { container } = render(<><FanDisplay role="amount" as="p">US$400</FanDisplay><FanDisplay role="caption" as="dt">총</FanDisplay></>);
  expect(container.querySelector("p")).toHaveAttribute("data-fan-display", "amount");
  expect(container.querySelector("dt")).toHaveAttribute("data-fan-display", "caption");
});

it("defaults to a span and keeps a caller class", () => {
  const { container } = render(<FanDisplay role="figure" className="x">17</FanDisplay>);
  expect(container.firstElementChild?.tagName).toBe("SPAN");
  expect(container.firstElementChild?.className).toContain("x");
});
