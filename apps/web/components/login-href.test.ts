import { describe, expect, it } from "vitest";

import { fanLoginHref } from "./login-href";

function parse(href: string) {
  const url = new URL(href, "https://byus.local");
  return { pathname: url.pathname, locale: url.searchParams.get("locale"), returnTo: url.searchParams.get("returnTo") };
}

describe("fanLoginHref", () => {
  it("keeps the current path, query and hash and adds the locale to both", () => {
    expect(parse(fanLoginHref("en", "/benefits?tab=rank&period=week#history"))).toEqual({
      pathname: "/login",
      locale: "en",
      returnTo: "/benefits?tab=rank&period=week&locale=en#history",
    });
  });

  it("replaces a stale locale in the return path", () => {
    expect(parse(fanLoginHref("ko", "/my/friends?locale=en")).returnTo).toBe("/my/friends?locale=ko");
  });

  it.each(["https://evil.example/x", "//evil.example", "/\\evil.example", "/login?returnTo=/my"])("falls back to home for %s", (unsafe) => {
    expect(parse(fanLoginHref("ko", unsafe)).returnTo).toBe("/?locale=ko");
  });
});
