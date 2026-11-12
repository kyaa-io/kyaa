import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: any) => <a {...props} data-prefetch={prefetch === undefined ? "default" : String(prefetch)} /> }));

import Link from "./hover-prefetch-link";

afterEach(cleanup);

it("does not prefetch a link until a pointer, touch or focus reaches it, then uses the default", () => {
  const enter = vi.fn();
  render(<><Link href="/a" onMouseEnter={enter}>A</Link><Link href="/b">B</Link><Link href="/c">C</Link></>);
  for (const name of ["A", "B", "C"]) expect(screen.getByText(name)).toHaveAttribute("data-prefetch", "false");
  fireEvent.mouseEnter(screen.getByText("A"));
  fireEvent.focus(screen.getByText("B"));
  expect(screen.getByText("A")).toHaveAttribute("data-prefetch", "null");
  expect(screen.getByText("B")).toHaveAttribute("data-prefetch", "null");
  expect(screen.getByText("C")).toHaveAttribute("data-prefetch", "false");
  expect(enter).toHaveBeenCalledTimes(1);
});

it("keeps an explicit prefetch value as given", () => {
  render(<><Link href="/a" prefetch>A</Link><Link href="/b" prefetch={false}>B</Link></>);
  fireEvent.mouseEnter(screen.getByText("B"));
  expect(screen.getByText("A")).toHaveAttribute("data-prefetch", "true");
  expect(screen.getByText("B")).toHaveAttribute("data-prefetch", "false");
});
