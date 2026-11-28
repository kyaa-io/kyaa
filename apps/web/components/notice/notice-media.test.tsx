import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { NoticeBody } from "./notice-body";
import { noticeMedia } from "./notice-media";

it("plays public assets inline and embeds only recognized YouTube video IDs", () => {
  const src = "/public-assets/cms-assets/test.mp4";
  const { container } = render(<NoticeBody adminPreview locale="ko" document={{ type: "doc", content: [
    { type: "noticeMedia", attrs: { src } },
    { type: "noticeMedia", attrs: { src: "https://youtu.be/abcdefghijk" } },
  ] }} />);
  const video = container.querySelector("video")!;
  expect([video.controls, video.muted, video.playsInline]).toEqual([true, true, true]);
  expect(container.querySelector("iframe")?.src).toBe("https://www.youtube-nocookie.com/embed/abcdefghijk");
  expect(noticeMedia("https://untrusted.example" + src)).toBeNull();
});
