import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GroupArtistBadge } from "./group-artist-badge";

const page = vi.hoisted(() => ({ value: null as null | { presence: { data?: { artists: unknown[] } } } }));
vi.mock("./group-page-context", () => ({ useOptionalGroupPage: () => page.value }));

it("draws the tag only when a verified artist is shown for the page", () => {
  page.value = { presence: { data: { artists: [] } } };
  const view = render(<GroupArtistBadge locale="ko" />);
  expect(screen.queryByText("인증 아티스트")).toBeNull();
  page.value = { presence: { data: { artists: [{}] } } };
  view.rerender(<GroupArtistBadge locale="ko" />);
  expect(view.container.querySelector("[data-fan-tag='artist']")).toHaveTextContent("인증 아티스트");
});
