import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FanPostFeed } from "./fan-post-feed";

const resource = vi.hoisted(() => ({ state: { status: "ready", data: { items: [], nextCursor: null, unavailableSources: [] } } as { status: string; data: { items: never[]; nextCursor: string | null; unavailableSources: never[] } }, retry: vi.fn(), refreshFailed: false }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: () => resource }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
afterEach(cleanup);

it("hides compact page numbers on an empty first page but keeps previous navigation on an empty later page", () => {
  resource.state = { status: "ready", data: { items: [], nextCursor: null, unavailableSources: [] } };
  const view = render(<FanPostFeed slug="artist" locale="ko" compact />);
  expect(view.container.querySelector("nav button[aria-current]")).toBeNull();
  resource.state = { status: "ready", data: { items: [], nextCursor: "c2", unavailableSources: [] } };
  view.rerender(<FanPostFeed slug="artist" locale="ko" compact />);
  const next = view.container.querySelector("nav button[aria-current]")?.parentElement?.querySelectorAll("button");
  expect(next).toBeTruthy();
  fireEvent.click(next![next!.length - 1]);
  resource.state = { status: "ready", data: { items: [], nextCursor: null, unavailableSources: [] } };
  view.rerender(<FanPostFeed slug="artist" locale="ko" compact />);
  const nav = view.container.querySelector("nav button[aria-current='page']")?.parentElement;
  expect(nav).toBeTruthy();
  expect(nav!.querySelectorAll("button").length).toBeGreaterThan(2);
});
