import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { redirect } = vi.hoisted(() => ({ redirect: vi.fn((href: string) => { throw new Error(`redirect:${href}`); }) }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../../components/login-page", () => ({ LoginPage: () => null }));

import LoginRoute from "./page";
import { LoginPage } from "../../components/login-page";

const state = "a".repeat(43);

describe("LoginRoute native reauthentication return", () => {
  it.each(["complete", "failed"])("returns %s callbacks to the originating app session", async reauth => {
    await expect(LoginRoute({ searchParams: Promise.resolve({ nativeReauth: state, reauth, locale: "ko" }) }))
      .rejects.toThrow(`redirect:kyaa-app:///auth/reauth?state=${state}`);
  });

  it.each([
    { nativeReauth: "https://evil.test/token", reauth: "complete" },
    { nativeReauth: [state, state], reauth: "complete" },
    { nativeReauth: state, reauth: "pending" },
  ])("keeps malformed native return queries on the ordinary login screen", async query => {
    const page = await LoginRoute({ searchParams: Promise.resolve(query) });
    expect(page.type).toBe(Suspense);
    expect(page.props.children.type).toBe(LoginPage);
  });

  it("preserves ordinary web login rendering", async () => {
    const page = await LoginRoute({ searchParams: Promise.resolve({ locale: "en", returnTo: "/my" }) });
    expect(page.type).toBe(Suspense);
    expect(page.props.children.type).toBe(LoginPage);
    expect(page.props.children.props).toEqual({ appleLoginEnabled: expect.any(Boolean), testAccountLoginEnabled: expect.any(Boolean) });
  });
});
