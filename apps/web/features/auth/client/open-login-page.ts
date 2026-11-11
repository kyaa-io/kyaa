"use client";
// Opens kyaa's login page and comes back to the current page after sign-in.
export function openLoginPage(): void {
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const locale = document.documentElement.lang || "ko";
  window.location.assign(new URL(`/login?${new URLSearchParams({ returnTo, locale })}`, window.location.origin).href);
}
