import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ ownerKey: "pending:0" }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupRequest: () => ({ ownerKey: auth.ownerKey, authenticated: auth.ownerKey.startsWith("u"), ready: !auth.ownerKey.startsWith("pending") }) }));
vi.mock("@/features/selected-bias/ui/selected-bias-chip", () => ({ SelectedBiasChip: () => <span data-testid="chip" /> }));
vi.mock("@/features/groups/ui/group-header-account", () => ({ GroupHeaderAccount: () => <span data-testid="account" /> }));
vi.mock("./fan-header-status", () => ({ FanHeaderStatus: () => <button data-header-status="" aria-expanded="false" /> }));
vi.mock("@/features/group-social/header-dm-link", () => ({ HeaderDmLink: () => <span data-testid="dm" /> }));
vi.mock("./fan-language-switch", () => ({ FanLanguageSwitch: () => <span data-testid="language" /> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined }) }));
import { GroupHeaderActions } from "./fan-app-shell";

const view = () => render(<GroupHeaderActions locale="ko" languageHref="/?locale=en" notificationsLabel="알림" />).container;
beforeEach(() => { auth.ownerKey = "pending:0"; });

it("holds the status slot empty while sign-in is unknown — no blank capsule", () => {
  const c = view();
  expect(c.querySelector("[data-header-status-pending]")).not.toBeNull();
  expect(c.querySelector("[data-header-status]")).toBeNull();
  expect(c.querySelector("[data-testid=chip]")).toBeNull();
});

it("shows the guest chip signed out and the capsule with the points signed in", () => {
  auth.ownerKey = "guest:0";
  let c = view();
  expect(c.querySelector("[data-header-status]")).toBeNull();
  expect(c.querySelector("[data-testid=chip]")).not.toBeNull();
  auth.ownerKey = "user-1:0";
  c = view();
  const capsule = c.querySelector("[data-header-status]")!;
  expect(capsule).toHaveAttribute("aria-expanded", "false");
  expect(c.querySelector("[data-header-status-pending]")).toBeNull();
});
