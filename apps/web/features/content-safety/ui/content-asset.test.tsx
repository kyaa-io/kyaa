import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ContentAssetImage } from "./content-asset";

const auth = vi.hoisted(() => ({ ready: true, authenticated: false, getAccessToken: vi.fn(), user: undefined }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready: true, generation: 0 }) }));
let intersect: IntersectionObserverCallback;
const disconnect = vi.fn();
const transport = vi.fn();
beforeEach(() => {
  auth.authenticated = false;
  auth.getAccessToken.mockReset();
  transport.mockReset().mockResolvedValue({ ok: true, blob: async () => new Blob(["image"]) });
  vi.stubGlobal("fetch", transport);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:photo");
    static revokeObjectURL = vi.fn();
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const photo = { id: "photo-id", width: 960, height: 640 };
const enter = () => act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));

it("defers protected thumbnail fetches until near the viewport and revokes the blob", async () => {
  const { unmount } = render(<ContentAssetImage asset={photo} locale="ko" alt="사진" loading="lazy" />);
  expect(transport).not.toHaveBeenCalled();
  act(() => intersect([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
  expect(transport).not.toHaveBeenCalled();
  enter();
  expect(await screen.findByRole("img", { name: "사진" })).toHaveAttribute("src", "blob:photo");
  expect(transport).toHaveBeenCalledTimes(1);
  unmount();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
});

it("retains authentication and retry for a deferred asset", async () => {
  auth.authenticated = true;
  auth.getAccessToken.mockResolvedValue("test-token");
  transport.mockResolvedValueOnce({ ok: false });
  render(<ContentAssetImage asset={photo} locale="ko" alt="사진" loading="lazy" />);
  enter();
  fireEvent.click(await screen.findByRole("button", { name: /다시/ }));
  await screen.findByRole("img", { name: "사진" });
  expect(transport).toHaveBeenLastCalledWith("/api/content-assets/photo-id", expect.objectContaining({ cache: "no-store", headers: { Authorization: "Bearer test-token" } }));
});

it("keeps eager consumers and browsers without IntersectionObserver working", async () => {
  vi.stubGlobal("IntersectionObserver", undefined);
  render(<ContentAssetImage asset={photo} locale="ko" alt="사진" loading="lazy" />);
  await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
  await screen.findByRole("img", { name: "사진" });
});

it("reads public previews without a token before SDK readiness, then reauthorizes", async () => {
  auth.ready = false; auth.authenticated = true;
  auth.getAccessToken.mockResolvedValue("fresh-token");
  try {
    const { rerender } = render(<ContentAssetImage asset={photo} locale="ko" alt="사진" anonymousPreview />);
    await screen.findByRole("img", { name: "사진" });
    expect(auth.getAccessToken).not.toHaveBeenCalled();
    expect(transport).toHaveBeenLastCalledWith("/api/content-assets/photo-id", expect.objectContaining({ headers: undefined, credentials: "omit" }));
    auth.ready = true;
    rerender(<ContentAssetImage asset={photo} locale="ko" alt="写真" />);
    await screen.findByRole("img", { name: "写真" });
    expect(auth.getAccessToken).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:photo");
  } finally { auth.ready = true; }
});

it("loads protected notice media with the current bearer token", async () => {
  auth.authenticated = true; auth.getAccessToken.mockResolvedValue("checked-in-token");
  render(<ContentAssetImage asset={photo} locale="ko" alt="행사 사진" noticeMedia />);
  await screen.findByRole("img", { name: "행사 사진" });
  expect(transport).toHaveBeenCalledWith("/api/public/notice-media/photo-id", expect.objectContaining({ headers: { Authorization: "Bearer checked-in-token" }, cache: "no-store" }));
});

it("requests an independently authorized admin notice preview", async () => {
  auth.authenticated = true; auth.getAccessToken.mockResolvedValue("admin-token");
  render(<ContentAssetImage asset={photo} locale="ko" alt="미리보기" noticeMedia adminPreview />);
  await screen.findByRole("img", { name: "미리보기" });
  expect(transport).toHaveBeenCalledWith("/api/public/notice-media/photo-id?admin=1", expect.objectContaining({ headers: { Authorization: "Bearer admin-token" } }));
});
