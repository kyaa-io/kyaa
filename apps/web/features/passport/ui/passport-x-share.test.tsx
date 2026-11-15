import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PassportXShare } from "./passport-x-share";

const auth = vi.hoisted(() => ({ ready: true, authenticated: true, getAccessToken: async () => "token" as string | null }));
vi.mock("@/features/auth/client/cognito-auth", () => ({ useByUsAuth: () => auth }));

const token = "c".repeat(32);
afterEach(() => { vi.unstubAllGlobals(); auth.authenticated = true; });

describe("PassportXShare", () => {
  it("links to X's composer with the member's share link, as a tracked social outbound link", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PassportXShare creator={{ slug: "elina", name: "엘리나" }} locale="ko" />);
    const link = await screen.findByRole("link", { name: "X에 공유" });
    const intent = new URL(link.getAttribute("href")!);
    expect(intent.hostname).toBe("x.com");
    expect(intent.searchParams.get("text")).toBe("엘리나 팬 패스포트를 받았어요 @kyaa_app");
    expect(new URL(intent.searchParams.get("url")!).pathname).toBe(`/s/${token}`);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.closest("[data-outbound-kind]")?.getAttribute("data-outbound-kind")).toBe("social");
    expect(fetchMock).toHaveBeenCalledWith("/api/community-stamps/share-link", expect.objectContaining({ method: "POST", body: JSON.stringify({ creator: "elina" }) }));
  });

  it("draws nothing for a guest and asks the server for nothing", () => {
    auth.authenticated = false;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PassportXShare creator={{ slug: "elina", name: "Elina" }} locale="en" />);
    expect(container.innerHTML).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("draws nothing when the member has no Passport for the creator", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { code: "COMMUNITY_STAMP_PASSPORT_REQUIRED" } }), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PassportXShare creator={{ slug: "elina", name: "Elina" }} locale="en" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});
