import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ShortsCatalog } from "./shorts-catalog";

vi.mock("@/components/fan-ui/fan-select-menu", () => ({ FanSelectMenu: ({ options, onValueChange }: { options: { value: string; label: string }[]; onValueChange: (value: string) => void }) => <button onClick={() => onValueChange(options[1]!.value)}>{options[1]!.label}</button> }));
vi.mock("@/components/fan-ui/fan-tabs", () => ({ FanTabs: ({ items }: { items: { label: string; onSelect: () => void }[] }) => <div>{items.map(item => <button key={item.label} onClick={item.onSelect}>{item.label}</button>)}</div> }));
vi.mock("./home-shorts", () => ({ HomeShorts: ({ items }: { items: { videoId: string }[] }) => <div data-testid="videos">{items.map(item => item.videoId).join(",")}</div> }));

it("sorts real reaction counts and keeps the artist filter when sorting", () => {
  const items = [
    { id: "1", videoId: "one", creator: { slug: "a", name: "A" } },
    { id: "2", videoId: "two", creator: { slug: "b", name: "B" } },
    { id: "3", videoId: "three", creator: { slug: "a", name: "A" } },
  ];
  render(<ShortsCatalog catalog={{ items: items as never, likes: { one: 2, two: 9, three: 5 } }} locale="ko" />);
  expect(screen.getByTestId("videos")).toHaveTextContent("one,two,three");
  fireEvent.click(screen.getByRole("button", { name: "인기" }));
  expect(screen.getByTestId("videos")).toHaveTextContent("two,three,one");
  fireEvent.click(screen.getByRole("button", { name: "A" }));
  expect(screen.getByTestId("videos")).toHaveTextContent("three,one");
});

it.each(["ko", "en", "ja", "zh-Hans", "zh-Hant", "es"] as const)("provides sort and artist controls in %s", locale => {
  const { unmount } = render(<ShortsCatalog catalog={{ items: [], likes: {} }} locale={locale} />);
  expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(2);
  unmount();
});
