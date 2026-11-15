import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CreatorFanLink } from "./creator-fan-link";
import { notifyFanActivityUpdated } from "./fan-activity-updates";
let authenticated = true;
let ownerId = "owner";
const getAccessToken = vi.fn(async () => "token");
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready: true, authenticated, user: { id: ownerId }, getAccessToken }) }));
const summary = (verified: boolean, slug = "elina") => verified ? [{ celebrity: { slug }, score: { level: "Bronze", points: 0 } }] : [];
beforeEach(() => { authenticated = true; ownerId = "owner"; vi.unstubAllGlobals(); });
it("does not call a reaction-only relationship completed fan verification", async () => {
  const fetcher = vi.fn(async () => Response.json({ passports: summary(false) }));
  vi.stubGlobal("fetch", fetcher);
  render(<CreatorFanLink slug="elina" name="엘리나" locale="ko" />);
  expect(await screen.findByRole("link", { name: "엘리나 팬페이지 보기" })).not.toHaveAttribute("data-verified");
  expect(fetcher.mock.calls).toHaveLength(1);
  expect(fetcher).toHaveBeenCalledWith("/api/passports?locale=ko&view=directory", expect.any(Object));
});
it("shows completion only for the matching creator Passport", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ passports: summary(true) })));
  render(<><CreatorFanLink slug="elina" name="엘리나" locale="ko" /><CreatorFanLink slug="kara" name="KARA" locale="ko" /></>);
  await waitFor(() => expect(screen.getByRole("link", { name: "엘리나 팬페이지 보기" })).toHaveAttribute("data-verified", "true"));
  expect(await screen.findByRole("link", { name: "KARA 팬페이지 보기" })).not.toHaveAttribute("data-verified");
});
it("refreshes a mounted card after fan verification creates a Passport", async () => {
  let verified = false;
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ passports: summary(verified) })));
  render(<CreatorFanLink slug="elina" name="엘리나" locale="ko" />);
  await screen.findByRole("link", { name: "엘리나 팬페이지 보기" });
  verified = true;
  act(() => notifyFanActivityUpdated("owner", ["summary", "passports"]));
  await waitFor(() => expect(screen.getByRole("link", { name: "엘리나 팬페이지 보기" })).toHaveAttribute("data-verified", "true"));
});
it("clears verification immediately after logout", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ passports: summary(true) })));
  const { rerender } = render(<CreatorFanLink slug="elina" name="엘리나" locale="ko" />);
  await waitFor(() => expect(screen.getByRole("link", { name: "엘리나 팬페이지 보기" })).toHaveAttribute("data-verified", "true"));
  authenticated = false;
  rerender(<CreatorFanLink slug="elina" name="엘리나" locale="ko" />);
  expect(screen.getByRole("link", { name: "엘리나 팬페이지 보기" })).not.toHaveAttribute("data-verified");
});
it("never displays the previous owner's completion when switching accounts", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ passports: summary(ownerId === "owner") })));
  const { rerender } = render(<CreatorFanLink slug="elina" name="엘리나" locale="ko" />);
  await waitFor(() => expect(screen.getByRole("link", { name: "엘리나 팬페이지 보기" })).toHaveAttribute("data-verified", "true"));
  ownerId = "other";
  rerender(<CreatorFanLink slug="elina" name="엘리나" locale="ko" />);
  expect(screen.getByRole("link", { name: "엘리나 팬페이지 보기" })).not.toHaveAttribute("data-verified");
  await screen.findByRole("link", { name: "엘리나 팬페이지 보기" });
});
it("preserves the fan page route when verification cannot load", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({}, { status: 503 })));
  render(<CreatorFanLink slug="elina" name="엘리나" locale="ko" />);
  expect(await screen.findByRole("link", { name: "엘리나 팬페이지 보기" })).toHaveAttribute("href", "/elina?locale=ko");
});
it("names the fan page destination in English", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ passports: summary(true) })));
  render(<CreatorFanLink slug="elina" name="Elina" locale="en" />);
  expect(await screen.findByRole("link", { name: "Elina View fan page" })).toHaveAttribute("href", "/elina?locale=en");
});
