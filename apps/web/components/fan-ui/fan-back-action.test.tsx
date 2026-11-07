import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { FanBackAction } from "./fan-back-action";

const router = vi.hoisted(() => ({ back: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/features/groups/ui/groups-release", () => ({ useGroupsRelease: () => true }));

beforeEach(() => router.back.mockClear());

it("goes back to where the viewer came from, in every locale's label", () => {
  vi.spyOn(window.history, "length", "get").mockReturnValue(3);
  render(<FanBackAction locale="ko" fallbackHref="/my?locale=ko" />);
  fireEvent.click(screen.getByRole("link", { name: "뒤로" }));
  expect(router.back).toHaveBeenCalledTimes(1);
});

it("keeps the fallback link for a page opened directly", () => {
  vi.spyOn(window.history, "length", "get").mockReturnValue(1);
  render(<FanBackAction locale="en" fallbackHref="/my?locale=en" />);
  const link = screen.getByRole("link", { name: "Back" });
  link.addEventListener("click", event => event.preventDefault());
  fireEvent.click(link);
  expect(link).toHaveAttribute("href", "/my?locale=en");
  expect(router.back).not.toHaveBeenCalled();
});
