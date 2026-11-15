import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import type { WaveAlbum } from "../domain/wave-media";
import { WaveMediaCard } from "./wave-media";
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated: true, getAccessToken: async () => "token" }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
vi.mock("@/features/content-safety/ui/authenticated-media", () => ({ AuthenticatedMedia: ({ asset }: { asset: { id: string } }) => <span data-testid="media">{asset.id}</span> }));
const album = { id: "album", celebritySlug: "kyaa-wave-fanpage", body: "Original caption", visibility: "public", revision: 1, author: { nickname: "Fan", avatarUrl: "/avatar.png", profileId: "profile" }, assets: Array.from({ length: 30 }, (_, index) => ({ id: `asset-${index}`, kind: "image", width: 600, height: 800, durationSeconds: null })), createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", isOwner: true, likeCount: 3, liked: false, commentCount: 1, commentPreview: { body: "First comment", author: { nickname: "Friend", avatarUrl: "/avatar.png" } } } as WaveAlbum;
afterEach(cleanup);
it.each(APP_LOCALES)("shows three photos plus remaining count, one comment and profile action in %s", locale => {
  const onSelect = vi.fn(), onProfile = vi.fn(); render(<WaveMediaCard album={album} locale={locale} onSelect={onSelect} onProfile={onProfile} onChanged={vi.fn()} />);
  expect(screen.getAllByTestId("media")).toHaveLength(3);
  expect(screen.getByText("+27")).toBeVisible();
  expect(screen.getByText("Original caption")).toBeVisible();
  expect(screen.getByText(/First comment/)).toBeVisible();
  fireEvent.click(screen.getByText("+27")); expect(onSelect).toHaveBeenCalledWith("album");
  fireEvent.click(screen.getByText("Fan")); expect(onProfile).toHaveBeenCalledWith(album.author);
});
