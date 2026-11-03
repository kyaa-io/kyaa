import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { FanPostFeed } from "./fan-post-feed";

const resource = vi.hoisted(() => ({ state: { status: "loading" } as { status: string; data?: { items: never[]; nextCursor: null; unavailableSources: never[] }; code?: string }, retry: vi.fn(), refreshFailed: false }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: () => resource }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
afterEach(cleanup);

it("shows an accessible initial skeleton, then the distinct empty and error states", () => {
  const view = render(<FanPostFeed slug="artist" locale="en" />);
  const loading = screen.getByRole("status", { busy: true });
  expect(loading).toHaveAccessibleName();
  expect(loading.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  resource.state = { status: "ready", data: { items: [], nextCursor: null, unavailableSources: [] } };
  view.rerender(<FanPostFeed slug="artist" locale="en" />);
  expect(screen.queryByRole("status", { busy: true })).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toBeInTheDocument();
  resource.state = { status: "error", code: "UNAVAILABLE" };
  view.rerender(<FanPostFeed slug="artist" locale="en" />);
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
});
