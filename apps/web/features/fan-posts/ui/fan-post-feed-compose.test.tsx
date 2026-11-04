import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FanPostFeed } from "./fan-post-feed";
const mocks = vi.hoisted(() => ({ auth: { ready: true, authenticated: true, user: { id: "viewer" } }, session: { ready: true, ownerId: "viewer", generation: 1 } }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => mocks.auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => mocks.session }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: () => ({ state: { status: "ready", data: { items: [], nextCursor: null, unavailableSources: [] } }, retry: vi.fn() }) }));
vi.mock("./post-composer", () => ({ PostComposer: ({ onCancel }: { onCancel: () => void }) => <div><input aria-label="Draft" autoFocus /><button onClick={onCancel}>Cancel</button></div> }));
beforeEach(() => { mocks.auth.ready = true; mocks.auth.authenticated = true; mocks.session.ready = true; });
afterEach(cleanup);
it("opens the intent only after authenticated session readiness, consumes on close and restores focus", async () => {
 mocks.session.ready = false; const consumed = vi.fn(); const view = render(<FanPostFeed slug="artist" locale="en" compact source="fans" composeIntent onComposeConsumed={consumed} />);
 expect(screen.queryByLabelText("Draft")).toBeNull(); mocks.session.ready = true; view.rerender(<FanPostFeed slug="artist" locale="en" compact source="fans" composeIntent onComposeConsumed={consumed} />);
 expect(screen.getByLabelText("Draft")).toHaveFocus(); fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(consumed).toHaveBeenCalledOnce(); expect(screen.queryByLabelText("Draft")).toBeNull(); await waitFor(() => expect(screen.getByRole("button", { name: /Write a post/ })).toHaveFocus());
 view.rerender(<FanPostFeed slug="artist" locale="en" compact source="fans" composeIntent={false} onComposeConsumed={consumed} />); view.rerender(<FanPostFeed slug="artist" locale="en" compact source="fans" composeIntent onComposeConsumed={consumed} />); expect(screen.getByLabelText("Draft")).toBeInTheDocument();
});
it("preserves the intent in the guest login return and never opens on official feed", () => {
 mocks.auth.authenticated = false; const href = "/artist?tab=board&source=fans&locale=en&compose=1"; const view = render(<FanPostFeed slug="artist" locale="en" compact source="fans" composeIntent composeReturnTo={href} />);
 expect(screen.getByRole("link", { name: /Write a post/ })).toHaveAttribute("href", `/login?locale=en&returnTo=${encodeURIComponent(href)}`); expect(screen.queryByLabelText("Draft")).toBeNull();
 mocks.auth.authenticated = true; view.rerender(<FanPostFeed slug="artist" locale="en" compact source="official" composeIntent />); expect(screen.queryByLabelText("Draft")).toBeNull();
});
