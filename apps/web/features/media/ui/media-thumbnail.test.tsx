import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MediaThumbnail } from "./media-thumbnail";
afterEach(cleanup);
it.each(["7690854938997558549", "7689367463607192852"])("uses the verified local cover for the curated TikTok recording %s", id => {
  const { container } = render(<MediaThumbnail image={null} href={`https://www.tiktok.com/@ifewknow/video/${id}`} kind="videos" source="kyaa" locale="ko" />);
  const src = new URL(container.querySelector("img")!.getAttribute("src")!, location.href);
  // Own files go through the image optimizer; the file itself is the verified local cover.
  expect(src.searchParams.get("url") ?? src.pathname).toBe(`/images/media/tiktok/${id}.jpg`);
  expect(src.origin).toBe(location.origin);
});

it.each(["https://youtu.be/abcdefghijk", "https://www.youtube.com/shorts/abcdefghijk", "https://www.youtube.com/live/abcdefghijk"])("recovers a missing cover for the specific recording %s", href => {
  const { container } = render(<MediaThumbnail image={null} href={href} kind="videos" source="kyaa" locale="ko" />);
  expect(container.querySelector("img")).toHaveAttribute("src", "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg");
});
it("preserves the complete portrait cover and replaces a decode failure with its actual provider", async () => {
  const { container } = render(<MediaThumbnail image="/cover.jpg" href="https://www.instagram.com/reel/DeRosgtTOQo/" kind="videos" source="kyaa" locale="ko" />);
  const image = container.querySelector("img")!;
  Object.defineProperties(image, { naturalWidth: { value: 720 }, naturalHeight: { value: 1280 } });
  fireEvent.load(image);
  await waitFor(() => expect(image).toHaveAttribute("data-media-portrait", "true"));
  expect(image.style.aspectRatio).toBe("720 / 1280");
  fireEvent.error(image);
  expect(container.querySelector("img")).toHaveAttribute("src", "/images/guest-home/instagram.svg");
  expect(screen.getByText("Instagram · 영상")).toBeInTheDocument();
});
it("does not invent a cover for a channel or untrusted video host", () => {
  const { container } = render(<MediaThumbnail image={null} href="https://www.youtube.com.evil.test/watch?v=abcdefghijk" kind="videos" source="kyaa" locale="ko" />);
  expect(container.querySelector("img")).toBeNull();
});

it("shows the platform and title when a compact gallery thumbnail fails", () => {
  const { container } = render(<MediaThumbnail image="/cover.jpg" href="https://www.instagram.com/p/DfEtowlgX1j/" kind="videos" source="kyaa" locale="ko" title="원문 제목" iconOnly />);
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("img")).toHaveAttribute("src", "/images/guest-home/instagram.svg");
  expect(container.textContent).toContain("Instagram");
});

it("never uses a letterboxed YouTube cover in a text-free tile (R5: no black bands)", async () => {
  const { container } = render(<MediaThumbnail image="https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg" href="https://www.youtube.com/watch?v=abcdefghijk" kind="videos" source="kyaa" locale="ko" title="원문 제목" iconOnly />);
  const img = container.querySelector("img")!;
  expect(img).toHaveAttribute("src", "https://i.ytimg.com/vi/abcdefghijk/hq720.jpg");
  // YouTube's 120×90 placeholder for a missing size counts as a failure; next/image reports the load after decoding.
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: 120 });
  fireEvent.load(img);
  await waitFor(() => expect(container.querySelector("img")).toHaveAttribute("src", "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg"));
  expect(container.innerHTML).not.toContain("hqdefault");
});

it("reads a stored API cover directly so image optimization cannot outlive its visibility", () => {
  const image = "/api/public/notice-media/20000000-0000-4000-8000-000000000002?variant=thumbnail";
  const { container } = render(<MediaThumbnail image={image} href="https://www.tiktok.com/@fixture/video/7696850953064189185" kind="videos" locale="ko" title="원문 제목" iconOnly />);
  const src = new URL(container.querySelector("img")!.getAttribute("src")!, location.href);
  expect(src.pathname + src.search).toBe(image);
  expect(container.querySelector("img")).toHaveAttribute("loading", "lazy");
  expect(container.querySelector("img")).not.toHaveAttribute("srcset");
});
