import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TypedLine } from "./typed-line";

const media = (reduced: boolean) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduced && query.includes("reduce"), addEventListener() {}, removeEventListener() {} }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("대사가 한 글자씩 나오고, 나오지 않은 글자도 자리를 차지하며, 끝나면 한 번 알린다", () => {
  media(false);
  const done = vi.fn();
  const { container } = render(<TypedLine text="또 뭐 볼래?" typing onDone={done} />);
  const line = () => container.querySelector("p")!;
  expect(line().textContent).toBe("또 뭐 볼래?");
  expect(line().querySelector("span")?.textContent).toBe("또 뭐 볼래?");
  act(() => void vi.advanceTimersByTime(28 * 3));
  expect(line().querySelector("span")?.textContent).toBe(" 볼래?");
  expect(done).not.toHaveBeenCalled();
  act(() => void vi.advanceTimersByTime(28 * 10));
  expect(line().querySelector("span")).toBeNull();
  expect(done).toHaveBeenCalledTimes(1);
});

it("typing 을 끄면(대화 상자를 누름) 남은 글자가 바로 다 나온다", () => {
  media(false);
  const { container, rerender } = render(<TypedLine text="또 뭐 볼래?" typing />);
  rerender(<TypedLine text="또 뭐 볼래?" typing={false} />);
  expect(container.querySelector("span")).toBeNull();
  expect(container.textContent).toBe("또 뭐 볼래?");
});

it("움직임 줄이기에서는 처음부터 다 나온다", () => {
  media(true);
  const { container } = render(<TypedLine text="또 뭐 볼래?" typing />);
  expect(container.querySelector("span")).toBeNull();
});
