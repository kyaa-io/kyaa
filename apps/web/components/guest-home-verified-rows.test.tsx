import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VerifiedCreatorRows, verifiedRowLimit, type VerifiedRowCreator } from "./guest-home-verified-rows";

afterEach(cleanup);
const make = (n: number, extra: Partial<VerifiedRowCreator["celebrity"]> = {}): VerifiedRowCreator[] =>
  Array.from({ length: n }, (_, i) => ({ celebrity: { slug: `c${i}`, name: `Creator ${i}`, image: null, ...extra } }));

describe("VerifiedCreatorRows", () => {
  it("renders nothing for no verified creators", () => {
    const { container } = render(<VerifiedCreatorRows creators={[]} locale="ko" label="x" />);
    expect(container).toBeEmptyDOMElement();
  });
  it.each([1, 3, 4])("caps %i creators at the row limit", (n) => {
    render(<VerifiedCreatorRows creators={make(n)} locale="ko" label="x" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(Math.min(n, verifiedRowLimit));
  });
  it("links public creators with the locale and leaves private ones unlinked", () => {
    render(<VerifiedCreatorRows creators={[...make(1), { celebrity: { slug: "p", name: "Private", image: null, isPublic: false } }]} locale="en" label="x" />);
    expect(screen.getByRole("link", { name: /Creator 0/ }).getAttribute("href")).toContain("locale=en");
    expect(screen.queryByRole("link", { name: /Private/ })).toBeNull();
    expect(screen.getByText("Private")).toBeInTheDocument();
  });
  it("keeps a long name in one element", () => {
    const name = "아주아주긴이름".repeat(12);
    render(<VerifiedCreatorRows creators={make(1, { name })} locale="ko" label="x" />);
    expect(screen.getByText(name)).toBeInTheDocument();
  });
});
