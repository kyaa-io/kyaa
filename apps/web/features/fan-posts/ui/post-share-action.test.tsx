// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ state: null as any }));
vi.mock("@/components/notice/notice-share", () => ({ NoticeShare: () => <button type="button">공유</button> }));
vi.mock("@/features/dukjil/ui/dukjil-provider", () => ({ useDukjil: () => h.state }));
import { PostShareAction } from "./post-share-action";

afterEach(() => { cleanup(); h.state = null; });

it("shows only the available share policy amount", () => {
  h.state = { status: "on", authenticated: true, hasPassport: true, catalog: { rules: { share: { points: 37 } } }, today: { policyActive: true, actions: { share: { remaining: 1, stamped: false } } } };
  const view = render(<PostShareAction title="글" locale="ko" contentType="post" />);
  expect(view.container.querySelector("[data-earn-badge=\"corner\"]")).toHaveTextContent("+37");
  h.state.today.actions.share.stamped = true;
  view.rerender(<PostShareAction title="글" locale="ko" contentType="post" />);
  expect(view.container.querySelector("[data-earn-badge]")).toBeNull();
  h.state.today.actions.share = { remaining: 0, stamped: false };
  view.rerender(<PostShareAction title="글" locale="ko" contentType="post" />);
  expect(view.container.querySelector("[data-earn-badge]")).toBeNull();
  h.state.today.actions.share.remaining = 1; h.state.catalog.rules.share.points = 0;
  view.rerender(<PostShareAction title="글" locale="ko" contentType="post" />);
  expect(view.container.querySelector("[data-earn-badge]")).toBeNull();
});

it("shows the same amount on a notice (아티스트 소식)", () => {
  h.state = { status: "on", authenticated: true, hasPassport: true, catalog: { rules: { share: { points: 10 } } }, today: { policyActive: true, actions: { share: { remaining: 2, stamped: false } } } };
  const { container } = render(<PostShareAction title="소식" locale="ko" contentType="notice" url="/c/elina/notices/walk" />);
  expect(container.querySelector("[data-earn-badge=\"corner\"]")).toHaveTextContent("+10");
});

it("does not advertise a reward without a known eligible status", () => {
  const { container } = render(<PostShareAction title="글" locale="ko" contentType="post" />);
  expect(container.querySelector("[data-earn-badge]")).toBeNull();
});
