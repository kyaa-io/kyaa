// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ state: null as any }));
vi.mock("@/features/dukjil/ui/dukjil-provider", () => ({ useDukjil: () => h.state }));
import { EarnBadgeCorner } from "./earn-badge";

const signedIn = (remaining: number) => ({ status: "on", authenticated: true, hasPassport: true, catalog: { rules: { reaction: { points: 1 } } }, today: { policyActive: true, actions: { reaction: { remaining, stamped: false } } } });
const corner = () => <EarnBadgeCorner action="reaction" locale="ko"><button type="button">좋아요</button></EarnBadgeCorner>;

afterEach(() => { cleanup(); h.state = null; });

it("a corner shows the points while some are left and nothing once today's share is used up (no `오늘 완료` over the button)", () => {
  h.state = signedIn(2);
  const view = render(corner());
  expect(view.container.querySelector('[data-earn-badge="corner"]')).toHaveTextContent("+1");
  h.state = signedIn(0);
  view.rerender(corner());
  expect(view.container.querySelector("[data-earn-badge]")).toBeNull();
  expect(view.container.textContent).not.toContain("오늘 완료");
  expect(view.container.querySelector("button")).toHaveTextContent("좋아요");
});
