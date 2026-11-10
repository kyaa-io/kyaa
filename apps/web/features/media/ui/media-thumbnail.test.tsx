import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MediaThumbnail } from "./media-thumbnail";
afterEach(cleanup);
it.each(["7690854938997558549", "7689367463607192852"])("uses the verified local cover for the curated TikTok recording %s", id => {
  const { container } = render(<MediaThumbnail image={null} href={`https://www.tiktok.com/@ifewknow/video/${id}`} kind="videos" source="kyaa" locale="ko" />);
  const src = new URL(container.querySelector("img")!.getAttribute("src")!, location.href);
  expect(src.pathname).toBe(`/images/media/tiktok/${id}.jpg`);
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
  expect(container.querySelector("img")).toBeNull();
  expect(screen.getByText("Instagram · 영상")).toBeInTheDocument();
});
it("does not invent a cover for a channel or untrusted video host", () => {
  const { container } = render(<MediaThumbnail image={null} href="https://www.youtube.com.evil.test/watch?v=abcdefghijk" kind="videos" source="kyaa" locale="ko" />);
  expect(container.querySelector("img")).toBeNull();
});

it("keeps an icon-only failed thumbnail without provider text for the thumbnail-only gallery", () => {
  const { container } = render(<MediaThumbnail image="/cover.jpg" href="https://www.instagram.com/p/DfEtowlgX1j/" kind="videos" source="kyaa" locale="ko" iconOnly />);
  fireEvent.error(container.querySelector("img")!);
  expect(container.querySelector("svg")).toBeInTheDocument();
  expect(container.textContent).toBe("");
});

it("never uses a letterboxed YouTube cover in a thumbnail-only tile and blurs the frame behind itself", async () => {
  const { container } = render(<MediaThumbnail image="https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg" href="https://www.youtube.com/watch?v=abcdefghijk" kind="videos" source="kyaa" locale="ko" iconOnly />);
  const fill = container.querySelector('[data-media-fill="blur"]')!;
  const [back, front] = [...fill.querySelectorAll("img")];
  expect(back).toHaveAttribute("src", "https://i.ytimg.com/vi/abcdefghijk/hq720.jpg");
  expect(front).toHaveAttribute("src", "https://i.ytimg.com/vi/abcdefghijk/hq720.jpg");
  expect(back).toHaveAttribute("aria-hidden", "true");
  Object.defineProperty(front, "naturalWidth", { configurable: true, value: 120 });
  fireEvent.load(front);
  // next/image reports the load after decoding, so the fallback lands a tick later.
  await waitFor(() => expect(container.querySelector('[data-media-fill="blur"] > img:last-child')).toHaveAttribute("src", "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg"));
});
