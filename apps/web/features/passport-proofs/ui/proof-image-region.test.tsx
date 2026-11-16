// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { containRegion, pointOnImage, rectInBox } from "./proof-image";
import { ProofImageMask } from "./proof-image-mask";

describe("contain region", () => {
  // 1000x4000 receipt in the 300x256 frame: the picture is 64x256, centred, with 118px empty on each side.
  const region = containRegion({ w: 300, h: 256 }, { w: 1000, h: 4000 });
  it("finds the picture inside the frame", () => {
    expect(region).toEqual({ x: 118, y: 0, w: 64, h: 256 });
  });
  it("maps the left quarter of the picture to x 0..0.25, not to the frame's 118px margin", () => {
    expect(pointOnImage(118, 10, region).x).toBe(0);
    expect(pointOnImage(134, 10, region).x).toBeCloseTo(0.25);
    expect(pointOnImage(5, 10, region).x).toBe(0);
    expect(pointOnImage(295, 10, region).x).toBe(1);
  });
  it("draws a stored rectangle back on the picture", () => {
    const at = rectInBox({ x: 0, y: 0, w: 0.25, h: 0.5 }, region, { w: 300, h: 256 });
    expect(at.x * 300).toBeCloseTo(118);
    expect(at.w * 300).toBeCloseTo(16);
    expect(at.h * 256).toBeCloseTo(128);
  });
  it("is the identity when the picture fills the frame", () => {
    expect(containRegion({ w: 200, h: 100 }, { w: 400, h: 200 })).toEqual({ x: 0, y: 0, w: 200, h: 100 });
  });
});

describe("ProofImageMask", () => {
  it("stores a drag over a tall picture against the picture, not the frame", () => {
    const onChange = vi.fn();
    const { container } = render(<ProofImageMask locale="ko" src="blob:x" masks={[]} onChange={onChange} onRemove={() => {}} />);
    const frame = container.querySelector("[data-proof-mask-frame]") as HTMLElement;
    const img = container.querySelector("img") as HTMLImageElement;
    frame.getBoundingClientRect = () => ({ left: 0, top: 0, width: 300, height: 256, right: 300, bottom: 256, x: 0, y: 0, toJSON() {} });
    Object.defineProperty(img, "naturalWidth", { value: 1000 });
    Object.defineProperty(img, "naturalHeight", { value: 4000 });
    fireEvent.load(img);
    fireEvent.pointerDown(frame, { clientX: 118, clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 134, clientY: 128, pointerId: 1 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
    const [[masks]] = onChange.mock.calls;
    expect(masks[0].x).toBeCloseTo(0);
    expect(masks[0].w).toBeCloseTo(0.25);
    expect(masks[0].h).toBeCloseTo(0.5);
  });
});
