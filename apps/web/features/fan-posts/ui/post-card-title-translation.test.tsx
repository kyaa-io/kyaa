import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { resetTranslationUnavailableForTest } from "@/features/content-safety/ui/use-automatic-translation";
import { PostCard } from "./post-card";
import type { FanPost } from "../domain/content";

vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "me" }, getAccessToken: async () => "t" }) }));
const session = vi.hoisted(() => ({ value: { ready: true, ownerId: "me", generation: 1 } }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session.value }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ busy: false, error: "", request: vi.fn() }) }));
vi.mock("@/features/content-safety/ui/content-actions", async importOriginal => ({ ...(await importOriginal<object>()), ContentActions: () => null }));
vi.mock("@/features/content-safety/ui/content-asset", () => ({ ContentAssetImage: () => null }));
vi.mock("@/features/content-safety/ui/authenticated-media", () => ({ AuthenticatedMedia: () => null }));

const base: FanPost = { id: "10000000-0000-4000-8000-000000000002", celebritySlug: "artist", body: "안녕하세요?\n잘 지내세요?", visibility: "public", revision: 1, author: { nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", isOwner: false, liked: false, likeCount: 0, commentCount: 0 };
const detail = (post: FanPost) => render(<PostCard presentation="board" detail post={post} locale="en" onChanged={vi.fn()} />);
const answer = (translatedTexts: string[]) => { const fetcher = vi.fn().mockImplementation(async () => Response.json({ translatedTexts, cached: false })); vi.stubGlobal("fetch", fetcher); return fetcher; };
// One slot goes out as `text`, two or more as `texts`; both are one request.
const sent = (fetcher: ReturnType<typeof vi.fn>) => { const body = JSON.parse(String(fetcher.mock.calls[0]![1].body)); return { ...body, texts: body.texts ?? [body.text] } as { texts: string[]; targetLocale: string }; };
const heading = () => screen.getByRole("heading", { level: 1 });
const articleText = (container: HTMLElement) => container.querySelector("[data-post-body]")?.textContent ?? "";

beforeEach(() => {
  // The hook keeps answers per reader session; a new generation per test keeps one test's answer out of the next.
  session.value = { ...session.value, generation: session.value.generation + 1 };
  resetTranslationUnavailableForTest();
  vi.stubGlobal("IntersectionObserver", class { constructor(private callback: IntersectionObserverCallback) {} observe() { this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); } disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("translates the title and the article in one request and tells them apart by position", async () => {
  const fetcher = answer(["Hello?", "How are you?"]);
  const { container } = detail(base);
  expect(heading()).toHaveTextContent("안녕하세요?");
  await waitFor(() => expect(heading()).toHaveTextContent("Hello?"));
  expect(heading()).toHaveAttribute("lang", "en");
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(String(fetcher.mock.calls[0]![0])).toBe("/api/display-translations");
  expect(sent(fetcher)).toEqual({ texts: ["안녕하세요?", "잘 지내세요?"], targetLocale: "en" });
  expect(articleText(container)).toContain("How are you?");
  expect(articleText(container)).not.toContain("Hello?");
  fireEvent.click(screen.getByRole("button", { name: "Show original" }));
  expect(heading()).toHaveTextContent("안녕하세요?");
  expect(heading()).not.toHaveAttribute("lang");
  expect(articleText(container)).toContain("잘 지내세요?");
  fireEvent.click(screen.getByRole("button", { name: "Translate" }));
  expect(heading()).toHaveTextContent("Hello?");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("a post with only a title is translated and can be shown in the original", async () => {
  const fetcher = answer(["Hello?"]);
  const { container } = detail({ ...base, body: "안녕하세요?" });
  await waitFor(() => expect(heading()).toHaveTextContent("Hello?"));
  expect(sent(fetcher).texts).toEqual(["안녕하세요?"]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(articleText(container)).not.toContain("Hello?");
  fireEvent.click(screen.getByRole("button", { name: "Show original" }));
  expect(heading()).toHaveTextContent("안녕하세요?");
});

it("an article answer without a line break keeps the title as the title", async () => {
  answer(["Hello?", "How are you? Fine, thanks."]);
  const { container } = detail(base);
  await waitFor(() => expect(heading()).toHaveTextContent("Hello?"));
  expect(articleText(container)).toContain("How are you? Fine, thanks.");
  expect(heading()).not.toHaveTextContent("How are you");
});

it("an article answer that starts with an empty line does not move text into the title or repeat it", async () => {
  answer(["Hello?", "\nHow are you?"]);
  const { container } = detail(base);
  await waitFor(() => expect(heading()).toHaveTextContent("Hello?"));
  expect(heading().textContent).toBe("Hello?");
  expect(articleText(container)).toContain("How are you?");
  expect(articleText(container)).not.toContain("Hello?");
});

it("a first line that is empty sends only the article and the title falls back to the board name", async () => {
  const fetcher = answer(["Line one"]);
  detail({ ...base, body: "\n둘째 줄" });
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(sent(fetcher).texts).toEqual(["둘째 줄"]);
  expect(heading()).not.toHaveAttribute("lang");
});

it("a post with a document shows the translated article in place of the document and the title in the header", async () => {
  const bodyDoc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "잘 지내세요?" }] }] };
  const fetcher = answer(["Hello?", "How are you?"]);
  const { container } = detail({ ...base, bodyDoc });
  await waitFor(() => expect(heading()).toHaveTextContent("Hello?"));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(articleText(container)).toContain("How are you?");
  fireEvent.click(screen.getByRole("button", { name: "Show original" }));
  expect(heading()).toHaveTextContent("안녕하세요?");
  expect(articleText(container)).toContain("잘 지내세요?");
});

it("a failed answer leaves the original title and article", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: { code: "TRANSLATION_FAILED" } }, { status: 502 })));
  const { container } = detail(base);
  await act(async () => {});
  expect(heading()).toHaveTextContent("안녕하세요?");
  expect(articleText(container)).toContain("잘 지내세요?");
});
