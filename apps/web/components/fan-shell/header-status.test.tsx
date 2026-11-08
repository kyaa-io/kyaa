import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ ownerKey: "pending:0" }));
vi.mock("@/features/groups/ui/use-group-resource", () => ({ useGroupRequest: () => ({ ownerKey: auth.ownerKey, authenticated: auth.ownerKey.startsWith("u"), ready: !auth.ownerKey.startsWith("pending") }) }));
vi.mock("@/features/groups/ui/group-header-account", () => ({ GroupHeaderAccount: () => <button type="button" data-testid="account" /> }));
vi.mock("@/features/notification/ui/header-notification-link", () => ({ HeaderNotificationLink: () => <a data-testid="bell" href="/notifications" /> }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: () => undefined }) }));
import { GroupHeaderActions } from "./fan-app-shell";

const view = () => render(<GroupHeaderActions locale="ko" languageHref="/?locale=en" notificationsLabel="알림" />).container;
beforeEach(() => { auth.ownerKey = "pending:0"; });

it("5차 R3: no numbers, no language, no capsule — while sign-in is unknown the avatar place is held empty", () => {
  const c = view();
  expect(c.querySelector("[data-testid=account]")).toBeNull();
  expect(c.textContent).not.toMatch(/\d/);
  expect(c.querySelector("[data-header-status]")).toBeNull();
});

it("signed out: the bell leads to sign-in and one 로그인 word; signed in: bell + avatar menu", () => {
  auth.ownerKey = "guest:0";
  let c = view();
  const links = c.querySelectorAll("a");
  expect(links).toHaveLength(2);
  expect(links[0]!.getAttribute("href")).toContain("/login");
  expect(links[0]!.querySelector('svg[data-icon="bell"]')).not.toBeNull();
  expect(links[1]!.textContent).toBe("로그인");
  auth.ownerKey = "user-1:0";
  c = view();
  expect(c.querySelector("[data-testid=bell]")).not.toBeNull();
  expect(c.querySelector("[data-testid=account]")).not.toBeNull();
  expect(c.textContent).toBe("");
});
