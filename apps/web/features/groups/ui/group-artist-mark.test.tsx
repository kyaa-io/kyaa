import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GroupArtistMark } from "./group-artist-mark";

describe("GroupArtistMark", () => {
  it("shows the verified artist wording with a hidden icon", () => {
    const { container } = render(<GroupArtistMark locale="ko" />);
    expect(screen.getByText("인증 아티스트")).toBeTruthy();
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});
