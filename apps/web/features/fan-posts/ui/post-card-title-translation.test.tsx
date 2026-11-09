import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { PostCard } from "./post-card";
import type { FanPost } from "../domain/content";

const state = vi.hoisted(() => ({ showing: false }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "me" }, getAccessToken: async () => "t" }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, ownerId: "me", generation: 1 }) }));
vi.mock("@/features/content-safety/ui/use-content-mutation", () => ({ useContentMutation: () => ({ busy: false, error: "", request: vi.fn() }) }));
vi.mock("@/features/content-safety/ui/content-actions", () => ({ ContentActions: () => null, ContentTranslation: ({ children }: { children: React.ReactNode }) => children, ContentTranslationView: ({ translation, children }: { translation: { showing: boolean; texts: string[] }; children: React.ReactNode }) => translation.showing ? <p>{translation.texts[0]}</p> : children }));
vi.mock("@/features/content-safety/ui/use-automatic-translation", () => ({
  useAutomaticTranslation: ({ texts }: { texts: string[] }) => ({ observeElement: () => undefined, eligible: true, showing: state.showing, texts: state.showing ? ["Hello?\nHow are you?"] : texts, busy: false, error: "", toggle: () => undefined }),
  TranslationControl: () => null,
}));
vi.mock("@/features/content-safety/ui/content-asset", () => ({ ContentAssetImage: () => null }));
vi.mock("@/features/content-safety/ui/authenticated-media", () => ({ AuthenticatedMedia: () => null }));

const post: FanPost = { id: "10000000-0000-4000-8000-000000000002", celebritySlug: "artist", body: "안녕하세요?\n잘 지내세요?", visibility: "public", revision: 1, author: { nickname: "팬", avatarUrl: "/images/avatars/star-pink.webp" }, assets: [], createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", isOwner: false, liked: false, likeCount: 0, commentCount: 0 };

beforeEach(() => { state.showing = false; });

it("board detail title is the source first line, and its translation while the body shows translated", () => {
  const { rerender } = render(<PostCard presentation="board" detail post={post} locale="en" onChanged={vi.fn()} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("안녕하세요?");
  expect(screen.getByRole("heading", { level: 1 })).not.toHaveAttribute("lang");
  state.showing = true;
  rerender(<PostCard presentation="board" detail post={post} locale="en" onChanged={vi.fn()} />);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hello?");
  expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "en");
  expect(post.body).toBe("안녕하세요?\n잘 지내세요?");
});
