import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { FanDisplay } from "./fan-display";
import { fanDisplayInkStart } from "./fan-display-optical";

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

it("marks an optical line and leaves the measured ink start to the browser", () => {
  const { container } = render(<FanDisplay role="figure" optical>신규 가입 이벤트</FanDisplay>);
  const line = container.firstElementChild!;
  expect(line).toHaveAttribute("data-fan-display", "figure");
  expect(line).toHaveAttribute("data-fan-display-optical");
  expect(line.className).toContain("optical");
  // 테스트 DOM에는 글꼴 목록이 없어 재지 않는다: CSS 기본값이 쓰인다
  expect((line as HTMLElement).style.getPropertyValue("--fan-display-ink-start")).toBe("");
});

it("reads the first glyph's left side bearing in em and skips what it cannot measure", () => {
  const element = document.body.appendChild(document.createElement("span"));
  element.textContent = " 신규";
  const seen: string[] = [];
  const context = { font: "", measureText: (text: string) => { seen.push(text); return { actualBoundingBoxLeft: -6.55 } as TextMetrics; } };
  expect(fanDisplayInkStart(element, context)).toBe(.066);
  expect(seen).toEqual(["신"]);
  expect(context.font).toContain("100px");
  expect(fanDisplayInkStart(element, null)).toBeNull();
  element.textContent = "";
  expect(fanDisplayInkStart(element, context)).toBeNull();
  element.textContent = "A";
  element.style.direction = "rtl";
  expect(fanDisplayInkStart(element, context)).toBeNull();
  element.remove();
});
