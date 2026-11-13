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
