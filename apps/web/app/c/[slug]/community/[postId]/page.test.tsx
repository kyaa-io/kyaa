import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn(), creator: vi.fn() }));
vi.mock("@/server/fan-posts/dependencies", () => ({ createContentDependencies: () => ({ rpc: mocks.rpc, authorize: mocks.authorize }) }));
vi.mock("@/server/seo/public-content", () => ({ loadSeoCreator: mocks.creator }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("not-found"); } }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: () => null, FanContentContainer: () => null }));
vi.mock("@/features/fan-posts/ui/fan-post-detail", () => ({ FanPostDetail: () => null }));
vi.mock("@/features/groups/ui/creator-group-post-page", () => ({ CreatorGroupPostPage: () => null }));
import { generateMetadata } from "./page";

const POST = "4a401460-52ad-45d8-b5a6-6641a5079140", ASSET = "5b501460-52ad-45d8-b5a6-6641a5079141";
const post = (over: object = {}) => ({ post: { id: POST, celebritySlug: "elina", body: "호엥 ㅜㅜㅜ 엘리나님 최고자나요\n포토카드 원해요!!\n진짜 말포이 여자버전", visibility: "public", revision: 1,
  author: { nickname: "아리가또", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [{ id: ASSET, width: 800, height: 600 }], createdAt: "2026-11-03T02:13:00Z", updatedAt: "2026-11-03T02:13:00Z",
  isOwner: false, likeCount: 7, liked: false, commentCount: 5, ...over } });
const props = (locale = "ko", slug = "elina", postId = POST) => ({ params: Promise.resolve({ slug, postId }), searchParams: Promise.resolve({ locale }) });
const meta = (value: Awaited<ReturnType<typeof generateMetadata>>) => value as { title: string; description: string; robots: unknown; openGraph: { title: string; description: string; locale: string; images: { url: string; alt?: string }[] }; twitter: { images: { url: string }[] } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.creator.mockResolvedValue({ slug: "elina", name: "엘리나", image: { url: "https://kyaa.io/public-assets/cms-assets/elina.jpg", alt: "엘리나" } });
  mocks.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? post() : null);
});

it("shows a public post's own title, opening, first photo and locale, read anonymously", async () => {
  const value = meta(await generateMetadata(props()));
  expect(value.openGraph.title).toBe("호엥 ㅜㅜㅜ 엘리나님 최고자나요");
  expect(value.openGraph.description).toBe("포토카드 원해요!! 진짜 말포이 여자버전");
  expect(value.openGraph.images[0]).toMatchObject({ url: expect.stringContaining(`/api/content-assets/${ASSET}`), alt: "호엥 ㅜㅜㅜ 엘리나님 최고자나요" });
  expect(value.twitter.images[0]?.url).toContain(`/api/content-assets/${ASSET}`);
  expect(value.openGraph.locale).toBe("ko_KR");
  expect(value.robots).toEqual({ index: true, follow: true, "max-image-preview": "large" });
  expect(mocks.authorize).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.filter(([name]) => name === "read_fan_post")).toEqual([["read_fan_post", { p_app_user_id: null, p_post_id: POST, p_locale: "ko" }]]);
});

it("follows the link's locale and uses the creator picture when the post has no photo", async () => {
  mocks.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? post({ assets: [] }) : null);
  const value = meta(await generateMetadata(props("en")));
  expect(value.openGraph.locale).toBe("en_US");
  expect(value.openGraph.images[0]?.url).toContain("elina.jpg");
  expect(value.openGraph.images[0]?.url).not.toContain("content-assets");
  expect(mocks.rpc).toHaveBeenCalledWith("read_fan_post", expect.objectContaining({ p_locale: "en" }));
});

it("keeps the site-wide preview for members-only, hidden, missing, malformed and wrong-creator posts and the Wave page", async () => {
  mocks.rpc.mockImplementation(async () => null);
  expect(await generateMetadata(props())).toEqual({});
  mocks.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? post({ visibility: "members" }) : null);
  expect(await generateMetadata(props())).toEqual({});
  expect(await generateMetadata(props("ko", "someone-else"))).toEqual({});
  mocks.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? { post: { id: POST } } : null);
  expect(await generateMetadata(props())).toEqual({});
  mocks.rpc.mockRejectedValue(new Error("down"));
  expect(await generateMetadata(props())).toEqual({});
  mocks.rpc.mockClear();
  expect(await generateMetadata(props("ko", "elina", "not-a-uuid"))).toEqual({});
  expect(await generateMetadata(props("ko", "kyaa-wave-fanpage"))).toEqual({});
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("cuts a long first line and a long opening without losing the start of either", async () => {
  mocks.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? post({ assets: [], body: `${"가".repeat(100)}\n${"나".repeat(200)}` }) : null);
  const value = meta(await generateMetadata(props()));
  expect(Array.from(value.openGraph.title)).toHaveLength(70);
  expect(value.openGraph.title.startsWith("가".repeat(69))).toBe(true);
  expect(Array.from(value.openGraph.description)).toHaveLength(120);
});

it("falls back to the creator name for a photo-only post and to the title when there is no opening", async () => {
  mocks.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? post({ body: "" }) : null);
  expect(meta(await generateMetadata(props())).openGraph.title).toBe("엘리나");
  mocks.rpc.mockImplementation(async (name: string) => name === "read_fan_post" ? post({ body: "한 줄 글" }) : null);
  const value = meta(await generateMetadata(props()));
  expect([value.openGraph.title, value.openGraph.description]).toEqual(["한 줄 글", "한 줄 글"]);
});
