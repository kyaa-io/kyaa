import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/i18n/locales";
import { PassportRequiredDialog } from "./passport-required-dialog";

const page = vi.hoisted(() => ({ kind: "fan" as "fan" | "brand" | "hobby" | undefined }));
const bias = vi.hoisted(() => ({ status: "empty" as "loading" | "guest" | "empty" | "ready" | "error", options: [] as { slug: string }[], requested: [] as (string | null)[] }));
vi.mock("@/features/groups/ui/group-page-context", () => ({ useOptionalGroupPage: () => ({ kind: page.kind, celebrity: { name: "엘리나" } }) }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => ({ authenticated: bias.status !== "guest", ready: true }) }));
vi.mock("@/features/selected-bias/domain/selected-bias-pick", () => ({ selectedBiasOptions: (data: { options: { slug: string }[] }) => data.options }));
vi.mock("@/components/fan-ui/use-owned-fan-resource", () => ({
  useOwnedFanResource: (url: string | null) => { bias.requested.push(url); return { state: bias.status === "ready" || bias.status === "empty" ? { status: "ready", data: { options: bias.options } } : { status: bias.status === "error" ? "error" : "loading" } }; },
}));
beforeEach(() => { page.kind = "fan"; bias.status = "empty"; bias.options = []; bias.requested = []; });
afterEach(cleanup);

it("opens with the artist title and a link to that artist's entry quiz when the viewer holds no passport of the artist", () => {
  render(<PassportRequiredDialog failure="passport" slug="elina" locale="ko" onClose={vi.fn()} />);
  expect(screen.getByRole("dialog", { name: "엘리나 패스포트가 필요해요" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "패스포트 만들러 가기" }).getAttribute("href")).toMatch(/^\/c\/elina\/verify\?locale=ko/);
  expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();
});
it("opens for a viewer whose passports are all of other artists", () => {
  bias.status = "ready"; bias.options = [{ slug: "aryeom" }];
  render(<PassportRequiredDialog failure="passport" slug="elina" locale="ko" onClose={vi.fn()} />);
  expect(screen.getByRole("dialog")).toBeTruthy();
});
it("stays closed for other failures and asks for no passport list at all", () => {
  render(<PassportRequiredDialog failure={null} slug="elina" locale="ko" onClose={vi.fn()} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(bias.requested.every(url => url === null)).toBe(true);
});
it("stays closed when the 403 is not a missing passport: the viewer holds it, the page is not a fan page, or the passport list is not known", () => {
  bias.status = "ready"; bias.options = [{ slug: "elina" }];
  const held = render(<PassportRequiredDialog failure="passport" slug="elina" locale="ko" onClose={vi.fn()} />);
  expect(screen.queryByRole("dialog")).toBeNull(); held.unmount();
  bias.status = "empty"; page.kind = "brand";
  const brand = render(<PassportRequiredDialog failure="passport" slug="elina" locale="ko" onClose={vi.fn()} />);
  expect(screen.queryByRole("dialog")).toBeNull(); brand.unmount();
  page.kind = "fan";
  for (const status of ["loading", "guest", "error"] as const) {
    bias.status = status;
    const view = render(<PassportRequiredDialog failure="passport" slug="elina" locale="ko" onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull(); view.unmount();
  }
});
it("has its own title, action and close label in all twelve languages", () => {
  const seen = new Set<string>();
  for (const locale of APP_LOCALES) {
    const view = render(<PassportRequiredDialog failure="passport" slug="elina" name="Elina" locale={locale} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    seen.add(`${dialog.getAttribute("aria-label") ?? dialog.textContent}`);
    expect(screen.getAllByRole("link").length).toBe(1); expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    view.unmount();
  }
  expect(seen.size).toBe(APP_LOCALES.length);
});
it("is the one helper used by reaction, comment and write, and each hides its inline error only while the dialog is open", async () => {
  const { readFileSync } = await import("node:fs");
  for (const f of ["features/fan-posts/ui/post-card.tsx", "features/fan-posts/ui/fan-post-detail.tsx", "features/fan-posts/ui/post-composer.tsx"]) {
    const source = readFileSync(f, "utf8");
    expect(source).toContain("<PassportRequiredDialog");
    expect(source).toContain("usePassportRequired(");
    expect(source).not.toContain('mutation.failure !== "passport"');
  }
});
