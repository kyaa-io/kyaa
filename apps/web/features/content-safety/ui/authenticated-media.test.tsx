import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {contentCopy} from '@/i18n/catalogs/features__fan_posts__ui';
import { AuthenticatedMedia } from "./authenticated-media";
const auth = vi.hoisted(() => ({ ready: true, authenticated: true, user: { id: "owner" }, getAccessToken: vi.fn(async () => "secret") }));
const session = vi.hoisted(() => ({ ready: true, ownerId: "owner", generation: 0 }));
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => auth }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => session }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); auth.authenticated = true; session.generation = 0; });
const asset = { id: "asset", kind: "video" as const, width: 1280, height: 720 };
it("uses only a thumbnail before detail playback and revokes both blobs across logout", async () => {
  const fetcher = vi.fn(async (_url: string, _init: RequestInit) => new Response(new Blob(["video"])));
  vi.stubGlobal("fetch", fetcher); vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValueOnce("blob:thumbnail").mockReturnValueOnce("blob:video"), revokeObjectURL: vi.fn() });
  const view = render(<AuthenticatedMedia asset={asset} locale="en" alt="Play video" />);
  expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:thumbnail");
  expect(fetcher.mock.calls[0]).toMatchObject(["/api/media/asset?variant=thumbnail", { headers: { Authorization: "Bearer secret" } }]);
  view.rerender(<AuthenticatedMedia asset={asset} locale="en" alt="Play video" play />);
  await waitFor(() => expect(view.container.querySelector("video")).toHaveAttribute("src", "blob:video"));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:thumbnail");
  expect(fetcher.mock.calls[1][0]).toBe("/api/media/asset?variant=original");
  auth.authenticated = false; view.rerender(<AuthenticatedMedia asset={asset} locale="en" alt="Play video" play />);
  expect(view.container.querySelector("video")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:video");
});
it("loads authorized media without throwIfAborted", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "throwIfAborted");
  delete (AbortSignal.prototype as { throwIfAborted?: unknown }).throwIfAborted;
  try {
    const fetcher = vi.fn(async () => new Response(new Blob(["thumbnail"])));
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("URL", { createObjectURL: vi.fn().mockReturnValue("blob:thumbnail"), revokeObjectURL: vi.fn() });
    render(<AuthenticatedMedia asset={asset} locale="en" alt="Fan video" />);
    expect(await screen.findByRole("img")).toHaveAttribute("src", "blob:thumbnail");
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    if (descriptor) Object.defineProperty(AbortSignal.prototype, "throwIfAborted", descriptor);
  }
});
it("aborts an in-flight request when the owner changes", async () => {
  const fetcher = vi.fn((_url: string, _init: RequestInit) => new Promise<Response>(() => {})); vi.stubGlobal("fetch", fetcher);
  const view = render(<AuthenticatedMedia asset={asset} locale="en" alt="Play video" play />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const signal = fetcher.mock.calls[0][1].signal!;
  session.generation++; view.rerender(<AuthenticatedMedia asset={asset} locale="en" alt="Play video" play />);
  expect(signal.aborted).toBe(true);
});
it('allows guest media only with the explicit fan-post read scope and revokes it when scope becomes private',async()=>{
 auth.authenticated=false;const fetcher=vi.fn(async(_url:string,_init:RequestInit)=>new Response(new Blob(['thumbnail'])));vi.stubGlobal('fetch',fetcher);vi.stubGlobal('URL',{createObjectURL:vi.fn().mockReturnValue('blob:public-fan-thumbnail'),revokeObjectURL:vi.fn()});
 const view=render(<AuthenticatedMedia asset={asset} locale='en' alt='Fan video'/>);await Promise.resolve();expect(fetcher).not.toHaveBeenCalled();view.rerender(<AuthenticatedMedia asset={asset} locale='en' alt='Fan video' publicFanPost/>);expect(await screen.findByRole('img')).toHaveAttribute('src','blob:public-fan-thumbnail');expect(fetcher).toHaveBeenCalledWith('/api/fan-posts/media/asset?variant=thumbnail',expect.objectContaining({credentials:'omit',headers:{}}));view.rerender(<AuthenticatedMedia asset={asset} locale='en' alt='Fan video'/>);expect(screen.queryByRole('img')).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:public-fan-thumbnail');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('does not downgrade an authenticated viewer with a missing token into a guest request',async()=>{auth.getAccessToken.mockResolvedValueOnce('');const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);render(<AuthenticatedMedia asset={asset} locale='en' alt='Fan video' publicFanPost/>);await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent(contentCopy('en').photoFailed));expect(fetcher).not.toHaveBeenCalled();});
