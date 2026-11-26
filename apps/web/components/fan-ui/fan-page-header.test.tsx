import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FanPageHeader } from "./fan-page-header";

describe("fan page header: official or fan-made", () => {
  const image = { src: null, alt: "" } as never;

  it("shows the kyaa official mark on an official page", () => {
    render(<FanPageHeader image={image} name="엘리나" kind="fan" locale="ko" verified />);
    expect(screen.getByRole("img", { name: "kyaa official" })).toBeInTheDocument();
    expect(screen.queryByText("팬이 만든 페이지(비공식)")).toBeNull();
  });

  it("shows the fan-made tag instead of the mark on an Unverified page", () => {
    render(<FanPageHeader image={image} name="팬이 연 페이지" kind="fan" locale="ko" unofficial />);
    expect(screen.getByText("팬이 만든 페이지(비공식)")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "kyaa official" })).toBeNull();
  });

  it("writes the tag in the page language", () => {
    render(<FanPageHeader image={image} name="Fan page" kind="fan" locale="ja" unofficial />);
    expect(screen.getByText("ファンが作ったページ（非公式）")).toBeInTheDocument();
  });
});
