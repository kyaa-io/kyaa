import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { PublishedCelebrity } from "@/server/content/content-domain";
import { CommunityScreen } from "./community-screen";

const push = vi.hoisted(() => vi.fn());
let fanCount = 99;
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: ({ children }: React.PropsWithChildren) => <>{children}</>, FanContentContainer: ({ children }: React.PropsWithChildren) => <main>{children}</main> }));
vi.mock("@/components/fan-ui/creator-avatar", () => ({ CreatorAvatar: () => null }));
vi.mock("@/features/fan-posts/ui/fan-post-feed", () => ({ FanPostFeed: ({ slug, returnTo, mediaOnly }: { slug: string; returnTo: string; mediaOnly?: boolean }) => <div data-testid="posts" data-slug={slug} data-return={returnTo} data-media={String(mediaOnly)} /> }));
vi.mock("@/features/certification/ui/certification-panel", () => ({ CertificationPanel: ({ slug }: { slug: string }) => <div data-testid="certifications" data-slug={slug} /> }));
vi.mock("@/features/fanpage/ui/leaderboard-panel", () => ({ LeaderboardPanel: ({ slug }: { slug: string }) => <div data-testid="ranking" data-slug={slug} /> }));
vi.mock("@/features/fanpage/ui/home-panels", () => ({ ResourceMessage: () => null }));
vi.mock("@/features/fanpage/ui/use-community-resource", () => ({ useCommunityResource: () => ({ state: { status: "ready", data: { likeCount: fanCount, fanCount, publicFanCount: fanCount, fans: [{ nickname: "별빛팬", avatarUrl: "/images/avatars/star-pink.webp" }] } }, retry: vi.fn() }) }));
const creators = ["elina", "yuna"].map((slug, displayOrder) => ({ slug, locale: "ko", name: slug, summary: "", roles: ["creator"], themes: [], socialLinks: [], displayOrder, fanCount: 0, image: { url: "/images/guest-home/elina-card.jpg", alt: slug, position: "center" } })) as PublishedCelebrity[];
beforeEach(() => { push.mockClear(); fanCount = 99; });

it("keeps the selected artist and locale across tabs, login return and creator switch", async () => {
  render(<CommunityScreen creators={creators} creator={creators[0]} locale="ko" />);
  expect(screen.getByTestId("posts")).toHaveAttribute("data-slug", "elina");
  expect(screen.getByTestId("posts")).toHaveAttribute("data-return", "/community?creator=elina&tab=posts&locale=ko");
  const tabs = screen.getByRole("navigation", { name: "커뮤니티" });
  expect(within(tabs).getByRole("link", { name: "찐팬 인증" })).toHaveAttribute("href", "/community?creator=elina&tab=certifications&locale=ko");
  expect(screen.getByRole("link", { name: "LIVE" })).toHaveAttribute("href", "/elina?tab=live&locale=ko#celebrity-content");
  fireEvent.click(screen.getByRole("combobox", { name: "최애 선택" }));
  const option = await screen.findByRole("option", { name: "yuna" });
  fireEvent.pointerDown(option, { button: 0, pointerType: "mouse" });
  fireEvent.click(option);
  expect(push).toHaveBeenCalledWith("/community?creator=yuna&tab=posts&locale=ko");
});

it("shows recent fans at 99 and replaces them with the leaderboard at 100", () => {
  const view = render(<CommunityScreen creators={creators} creator={creators[1]} locale="ko" tab="fans" />);
  expect(screen.getByText("99명")).toBeInTheDocument();
  expect(screen.getAllByText("별빛팬")).toHaveLength(1);
  expect(screen.queryByTestId("ranking")).not.toBeInTheDocument();
  fanCount = 100;
  view.rerender(<CommunityScreen creators={creators} creator={creators[1]} locale="ko" tab="fans" />);
  expect(screen.getByTestId("ranking")).toHaveAttribute("data-slug", "yuna");
  expect(screen.queryByText("별빛팬")).not.toBeInTheDocument();
  view.rerender(<CommunityScreen creators={creators} creator={creators[1]} locale="ko" tab="certifications" />);
  expect(screen.getByTestId("certifications")).toHaveAttribute("data-slug", "yuna");
});

it("routes requests to existing artist-specific forms and handles an empty directory", () => {
  const view = render(<CommunityScreen creators={creators} creator={creators[1]} locale="ko" tab="requests" />);
  expect(screen.getByRole("link", { name: /일정 제안/ })).toHaveAttribute("href", "/c/yuna/schedule-suggestions?locale=ko");
  expect(screen.getByRole("link", { name: "팬페이지 개설 신청" })).toHaveAttribute("href", "/bias/requests?locale=ko");
  view.rerender(<CommunityScreen creators={[]} locale="ko" />);
  expect(screen.getByRole("status")).toHaveTextContent("참여할 커뮤니티를 준비하고 있어요.");
  expect(screen.queryByLabelText("최애 선택")).not.toBeInTheDocument();
});

it("preserves media mode in tabs and creator changes and offers a clear reset", async () => {
  render(<CommunityScreen creators={creators} creator={creators[0]} locale="ko" mediaOnly />);
  expect(screen.getByTestId("posts")).toHaveAttribute("data-media", "true");
  expect(screen.getByTestId("posts")).toHaveAttribute("data-return", "/community?creator=elina&tab=posts&locale=ko&media=1");
  expect(screen.getByRole("link", { name: "사진/영상만 보기" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: /^전체$/ })).toHaveAttribute("href", "/community?creator=elina&tab=posts&locale=ko");
  expect(within(screen.getByRole("navigation", { name: "커뮤니티" })).getByRole("link", { name: "함께하는 팬" })).toHaveAttribute("href", "/community?creator=elina&tab=fans&locale=ko&media=1");
  const sidebar = screen.getByRole("complementary");
  expect(within(sidebar).getByRole("link", { name: "함께하는 팬" })).toHaveAttribute("href", "/community?creator=elina&tab=fans&locale=ko&media=1");
  expect(within(sidebar).getByRole("link", { name: "찐팬 인증" })).toHaveAttribute("href", "/community?creator=elina&tab=certifications&locale=ko&media=1");
  fireEvent.click(screen.getByRole("combobox", { name: "최애 선택" }));
  const option = await screen.findByRole("option", { name: "yuna" });
  fireEvent.pointerDown(option, { button: 0, pointerType: "mouse" }); fireEvent.click(option);
  expect(push).toHaveBeenCalledWith("/community?creator=yuna&tab=posts&locale=ko&media=1");
});

it("shows fan-count-ranked hot communities and omits an empty ranking", () => {
  const ranked = creators.map((creator, index) => ({ ...creator, fanCount: index ? 200 : 50 }));
  const view = render(<CommunityScreen creators={ranked} creator={ranked[0]} locale="ko" />);
  const hot = screen.getByRole("region", { name: "핫한 커뮤니티" });
  expect(within(hot).getByText("팬 수 기준")).toBeInTheDocument();
  expect(within(hot).getAllByRole("link")[0]).toHaveAttribute("href", "/community?creator=yuna&tab=posts&locale=ko");
  view.rerender(<CommunityScreen creators={creators} creator={creators[0]} locale="ko" />);
  expect(screen.queryByRole("region", { name: "핫한 커뮤니티" })).not.toBeInTheDocument();
});
