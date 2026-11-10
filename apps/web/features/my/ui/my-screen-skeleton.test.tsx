import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MyScreen } from "./my-screen";
import { GroupsReleaseProvider } from "@/features/groups/ui/groups-release";

vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ ready: true, authenticated: true, user: { id: "owner-a" } }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true }) }));
vi.mock("@/components/fan-ui/use-owned-fan-resource", () => ({ useOwnedFanResource: () => ({ state: { status: "loading" }, retry: vi.fn() }) }));
vi.mock("@/features/profile/ui/use-avatar", () => ({ useAvatar: () => ({ state: { status: "loading" } }) }));
vi.mock("@/components/fan-shell/fan-app-shell", () => ({ FanAppFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, FanContentContainer: ({ children }: { children: React.ReactNode }) => <main>{children}</main>, fanUtilityCanvasClassName: "" }));

const before = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

it.each(["ko", "en"] as const)("loads in the real card order with no painted loading text (%s)", (locale) => {
  const { container } = render(<GroupsReleaseProvider enabled><MyScreen locale={locale} /></GroupsReleaseProvider>);
  const titles = locale === "ko" ? ["내 패스포트", "바로가기"] : ["My Passport", "Shortcuts"];
  const headings = titles.map((name) => screen.getByRole("heading", { name }));
  headings.slice(1).forEach((heading, index) => expect(before(headings[index], heading)).toBe(true));
  const status = screen.getByRole("status");
  expect(status.className).toMatch(/srOnly/);
  const painted = (container.textContent ?? "").replace(status.textContent ?? "", "");
  expect(painted).not.toMatch(/불러오는 중|Loading/);
  expect(screen.queryByRole("heading", { name: locale === "ko" ? "예약한 LIVE" : "Reserved LIVE" })).not.toBeInTheDocument();
});

it("keeps the passport chip row for a viewer who had several passports last time", () => {
  localStorage.setItem("kyaa:my:passport-chips", "1");
  const { container } = render(<GroupsReleaseProvider enabled><MyScreen locale="ko" /></GroupsReleaseProvider>);
  expect(container.querySelector("[data-passport-chip-space]")).not.toBeNull();
  localStorage.removeItem("kyaa:my:passport-chips");
});
