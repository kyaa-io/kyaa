import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MediaBackdrop, MediaFill } from "./media-fill";

describe("MediaFill (R5)", () => {
  it("puts the picture's own copy behind it, hidden from assistive technology, and keeps the picture whole", () => {
    const { container } = render(<MediaFill src="/images/a.png" className="frame"><img src="/images/a.png" alt="로고" /></MediaFill>);
    const frame = container.querySelector("[data-media-fill]")!;
    expect(frame.className).toContain("frame");
    const [backdrop, picture] = Array.from(frame.querySelectorAll("img"));
    expect(backdrop).toHaveAttribute("data-media-backdrop");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
    expect(backdrop).toHaveAttribute("alt", "");
    expect(backdrop).toHaveAttribute("src", "/images/a.png");
    expect(picture).toHaveAttribute("alt", "로고");
  });
  it("renders no backdrop without a source", () => {
    const { container } = render(<><MediaBackdrop src={null} /><MediaFill src={undefined}><span /></MediaFill></>);
    expect(container.querySelector("img")).toBeNull();
  });
});
