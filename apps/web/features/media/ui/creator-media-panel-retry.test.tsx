import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CreatorMediaPanel } from "./creator-media-panel";

vi.mock("next/navigation", () => ({ usePathname: () => "/elina", useSearchParams: () => new URLSearchParams("tab=board&section=media&locale=ko"), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: false, user: null, getAccessToken: async () => null }) }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: false }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
vi.mock("@/features/fanpage/ui/use-news-source", () => ({ useNewsSource: (url: string | null) => ({
  state: { status: "ready", data: url?.includes("/media?") ? [{ id: "photo", kind: "photos", title: "쿠킹 클래스", image: null, asset: { id: "11111111-1111-4111-8111-111111111111", width: 4, height: 3 }, href: "/c/elina/notices/photo", date: "2026-10-18T00:00:00Z" }] : [], nextCursor: null, moreLoading: false, moreError: false },
  retry: vi.fn(), loadMore: vi.fn(),
}) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("keeps the failed-image retry button outside the card link and retries on click", async () => {
  const fetchMock = vi.fn(async () => new Response("", { status: 500 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<CreatorMediaPanel slug="elina" locale="ko" />);
  const retry = await screen.findByRole("button", { name: "다시 시도" });
  expect(retry.closest("a")).toBeNull();
  const calls = fetchMock.mock.calls.length;
  fireEvent.click(retry);
  await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(calls));
});
