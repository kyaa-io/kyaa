import { afterEach, describe, expect, it, vi } from "vitest";
import { peekResource, storeResource, syncResourceOwner } from "@/components/fan-ui/resource-cache";
import { accountSwitchEnabled } from "../domain/account-switch-availability";
import { beginAccountSwitch, clearAccountSwitch, guardRestoredPagesAfterSignOut, markSignedOut, publicReturnPath, readAccountSwitch, settleAccountSwitch } from "./account-switch";

afterEach(() => { clearAccountSwitch(); window.sessionStorage.clear(); vi.useRealTimers(); });

describe("account switch return page", () => {
  it("keeps a public page and its language, drops the query", () => {
    expect(publicReturnPath("/pages/elina?tab=board&ref=dm", "ja")).toBe("/pages/elina?locale=ja");
    expect(publicReturnPath("/", "ko")).toBe("/?locale=ko");
  });
  it("sends private context (MY, settings, admin, applications, DM) and outside addresses home", () => {
    for (const path of ["/my/wallet?view=attendance", "/my/friends", "/settings", "/admin/celebrities", "/pages/groups/apply", "/pages/elina/manage", "//evil.example/x", "https://evil.example", "/notifications"])
      expect(publicReturnPath(path, "en")).toBe("/?locale=en");
  });
});

describe("account switch result", () => {
  it("announces a switch only when the signed-in member is a different one", () => {
    beginAccountSwitch("member-a", "/pages/elina", "ko");
    expect(settleAccountSwitch("member-b")).toBe("switched");
    expect(readAccountSwitch()).toBeNull();
  });
  it("ends silently when the same member signs back in", () => {
    beginAccountSwitch("member-a", "/", "ko");
    expect(settleAccountSwitch("member-a")).toBe("same");
    expect(readAccountSwitch()).toBeNull();
  });
  it("decides nothing while signed out, so a login cancelled midway stays signed out with no result", () => {
    beginAccountSwitch("member-a", "/pages/elina", "ko");
    expect(settleAccountSwitch(null)).toBeNull();
    expect(readAccountSwitch()?.returnTo).toBe("/pages/elina?locale=ko");
  });
  it("forgets a switch after 30 minutes", () => {
    beginAccountSwitch("member-a", "/", "ko", 1_000);
    expect(settleAccountSwitch("member-b", 1_000 + 31 * 60_000)).toBeNull();
  });
});

describe("after sign-out", () => {
  it("reloads a page the browser restores from its back-forward cache", () => {
    const reload = vi.fn();
    const remove = guardRestoredPagesAfterSignOut(reload);
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(reload).not.toHaveBeenCalled();
    markSignedOut(Date.now() + 1);
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: false }));
    expect(reload).not.toHaveBeenCalled();
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
    expect(reload).toHaveBeenCalledTimes(1);
    remove();
  });
  it("does not keep account A's balance for account B", () => {
    syncResourceOwner("member-a:0");
    storeResource("member-a:0:ko:true:/api/me/wallet", { points: 7811 });
    expect(peekResource("member-a:0:ko:true:/api/me/wallet")?.value).toEqual({ points: 7811 });
    syncResourceOwner("guest:1");
    syncResourceOwner("member-b:2");
    expect(peekResource("member-a:0:ko:true:/api/me/wallet")).toBeUndefined();
    expect(peekResource("member-b:2:ko:true:/api/me/wallet")).toBeUndefined();
  });
});

describe("release", () => {
  it("is on for DEV and local development only", () => {
    expect(accountSwitchEnabled({ APP_ENV: "dev", NODE_ENV: "production" })).toBe(true);
    expect(accountSwitchEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(accountSwitchEnabled({ APP_ENV: "prod", NODE_ENV: "production" })).toBe(false);
    expect(accountSwitchEnabled({ APP_ENV: "staging", NODE_ENV: "production" })).toBe(false);
    expect(accountSwitchEnabled({ NODE_ENV: "production" })).toBe(false);
  });
});
