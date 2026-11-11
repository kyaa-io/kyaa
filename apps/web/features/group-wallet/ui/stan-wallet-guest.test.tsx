// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/benefits", useSearchParams: () => new URLSearchParams() }));
import { StanWallet } from "./stan-wallet";

afterEach(cleanup);

it("signed out: one login scene with the four wallet assets replaces the four locked tiles", () => {
  const { container } = render(<StanWallet locale="ko" state={{ kind: "guest", action: <a href="/login">로그인</a> }} stamps="locked" hearts="locked" links={{ hearts: "#" }} />);
  expect(container.querySelectorAll("[data-login-scene] img")).toHaveLength(4);
  expect(screen.getByText("포인트 · 응모권 · 스탬프 · 하트")).toBeTruthy();
  expect(screen.getByRole("link", { name: "로그인" })).toBeTruthy();
  expect(container.querySelector("[data-cell]")).toBeNull();
  expect(screen.queryAllByRole("img", { name: "로그인 후 확인" })).toHaveLength(0);
});
