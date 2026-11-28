// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/benefits", useSearchParams: () => new URLSearchParams() }));
import { StanWallet } from "./stan-wallet";

afterEach(cleanup);

it("signed out (대표 11/13 09:39): each swap line keeps its cells with locked values, and the sign-in action takes the button's place", () => {
  const { container } = render(<StanWallet locale="ko" part="tickets" state={{ kind: "guest", action: <a href="/login">로그인</a> }} stamps="locked" hearts="locked" links={{ hearts: "#" }} />);
  expect([...container.querySelectorAll("[data-cell]")].map((n) => n.getAttribute("data-cell"))).toEqual(["points", "tickets"]);
  expect(screen.getByRole("link", { name: "로그인" })).toBeTruthy();
  expect(screen.queryAllByRole("button")).toHaveLength(0);
  expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
});

it("대표 11/28 195099: signed out, each cell is one line — a small lock follows 사용/획득 and no balance line is added", () => {
  const { container } = render(<StanWallet locale="ko" part="tickets" state={{ kind: "guest", action: null }} loginHref="/login" stamps="locked" hearts="locked" links={{ hearts: "#" }} />);
  for (const [name, text] of [["points", "마일리지100마일리지사용"], ["tickets", "응모권1장획득"]]) {
    const cell = container.querySelector(`[data-cell="${name}"]`) as HTMLElement;
    expect(cell.hasAttribute("data-locked")).toBe(true);
    expect(cell.textContent).toBe(text);
    const lock = cell.querySelector('[role="img"][aria-label="로그인 후 확인"]') as HTMLElement;
    expect(lock.querySelector("svg")?.getAttribute("width")).toBe("16");
    // beside the name and amount, on the same line
    expect(lock.previousElementSibling?.textContent).toMatch(/(사용|획득)$/);
    expect(lock.parentElement?.parentElement?.textContent).toBe(text);
  }
  expect(screen.getByRole("link", { name: "광고보기 교환" })).toBeTruthy();
});

it("signed in: the balance keeps its own line and there is no lock", () => {
  const { container } = render(<StanWallet locale="ko" part="tickets" state={{ kind: "ready", points: 137, tickets: 4, pointCost: 100 }} stamps={4} hearts={0} links={{ hearts: "#" }} />);
  expect(container.querySelector('[data-cell="points"]')?.hasAttribute("data-locked")).toBe(false);
  expect(container.querySelector('[role="img"][aria-label="로그인 후 확인"]')).toBeNull();
  expect(container.textContent).toContain("보유 137 마일리지");
});

