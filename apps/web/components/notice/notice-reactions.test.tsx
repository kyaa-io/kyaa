import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ authenticated: true, data: { reaction: null as "like" | "dislike" | null, likeCount: 2, dislikeCount: null }, request: vi.fn(), retry: vi.fn(), celebrate: vi.fn() }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: h.authenticated, user: h.authenticated ? { id: "fan" } : null }) }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: () => ({ state: { status: "ready", data: h.data }, retry: h.retry }) }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ busy: false, error: "", request: h.request }) }));
vi.mock("@/components/fan-ui/reward-celebration", () => ({ celebrateReward: h.celebrate }));
vi.mock("@/components/notice/notice-share", () => ({ NoticeShare: () => <button type="button">공유</button> }));
vi.mock("@/features/dukjil/ui/dukjil-provider", () => ({ useDukjil: () => ({ status: "on", authenticated: true, hasPassport: true, catalog: { rules: { reaction: { points: 1 }, share: { points: 10 } } }, today: { policyActive: true, actions: { reaction: { count: 0, points: 0, remaining: 5, stamped: false }, share: { count: 0, points: 0, remaining: 3, stamped: false } } } }) }));
import { NoticeReactions } from "./notice-reactions";

afterEach(() => { cleanup(); vi.clearAllMocks(); h.authenticated = true; h.data = { reaction: null, likeCount: 2, dislikeCount: null }; });
const badges = (container: HTMLElement) => [...container.querySelectorAll("[data-earn-badge=\"corner\"]")].map(node => node.textContent?.match(/\+\d+/)?.[0]);

it("shows the board's point badge on like, dislike and share, and celebrates what a first reaction paid", async () => {
  h.request.mockResolvedValue({ reaction: "dislike", likeCount: 2, dislikeCount: null, reward: { points: 1, stamps: 0 } });
  const { container } = render(<NoticeReactions slug="elina" noticeSlug="walk" title="산책" locale="ko" />);
  expect(badges(container)).toEqual(["+1", "+1", "+10"]);
  fireEvent.click(screen.getByRole("button", { name: "싫어요" }));
  await waitFor(() => expect(h.celebrate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ locale: "ko", points: 1, stamps: 0 })));
  expect(h.request).toHaveBeenCalledExactlyOnceWith("/api/celebrities/elina/notices/walk/reaction?locale=ko", "PUT", { reaction: "dislike" });
  // The answer (state plus reward) is accepted as the new state: the reaction badges go once a reaction is chosen.
  await waitFor(() => expect(badges(container)).toEqual(["+10"]));
});

it("celebrates nothing when the answer carries no reward, and offers no reaction badge once one is chosen", async () => {
  h.data = { reaction: "like", likeCount: 3, dislikeCount: null };
  h.request.mockResolvedValue({ reaction: null, likeCount: 2, dislikeCount: null });
  const { container } = render(<NoticeReactions slug="elina" noticeSlug="walk" title="산책" locale="ko" />);
  expect(badges(container)).toEqual(["+10"]);
  fireEvent.click(screen.getByRole("button", { name: /좋아요/ }));
  await waitFor(() => expect(h.retry).toHaveBeenCalled());
  expect(h.celebrate).not.toHaveBeenCalled();
});
