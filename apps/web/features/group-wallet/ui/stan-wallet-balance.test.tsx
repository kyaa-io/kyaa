// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/benefits", useSearchParams: () => new URLSearchParams() }));
import { StanWallet } from "./stan-wallet";

afterEach(cleanup);

const ready = (points: number, tickets: number) => ({ kind: "ready" as const, points, tickets, pointCost: 100 });
const cell = (container: HTMLElement, name: string) => container.querySelector(`[data-cell="${name}"]`) as HTMLElement;

it("대표 11/13 20:36: the amounts read 100P 사용 and 1장 획득, with no minus or plus sign, and the balance sits on its own line", () => {
  const { container } = render(<StanWallet locale="ko" part="tickets" state={ready(1243, 20)} stamps={6} hearts={0} links={{ hearts: "#" }} />);
  expect(cell(container, "points").textContent).toBe("포인트100P사용보유 1,243P");
  expect(cell(container, "tickets").textContent).toBe("응모권1장획득보유 20장");
  expect(container.textContent).not.toMatch(/[−+]/);
});

it("감독 11/13 21:3x: a balance that changes highlights its cell once; loading → number and an unchanged balance do not", () => {
  const props = { locale: "ko" as const, part: "tickets" as const, stamps: 6, hearts: 0, links: { hearts: "#" } };
  const { container, rerender } = render(<StanWallet {...props} state={{ kind: "loading" }} />);
  rerender(<StanWallet {...props} state={ready(1243, 20)} />);
  expect(cell(container, "points").hasAttribute("data-changed")).toBe(false);
  rerender(<StanWallet {...props} state={ready(1143, 21)} />);
  expect(cell(container, "points").hasAttribute("data-changed")).toBe(true);
  expect(cell(container, "tickets").hasAttribute("data-changed")).toBe(true);
  // jsdom has no CSS animations, so React listens for the prefixed name; a real browser sends animationend.
  act(() => { cell(container, "points").dispatchEvent(new Event("webkitAnimationEnd", { bubbles: true })); });
  expect(cell(container, "points").hasAttribute("data-changed")).toBe(false);
  expect(cell(container, "tickets").hasAttribute("data-changed")).toBe(true);
});
