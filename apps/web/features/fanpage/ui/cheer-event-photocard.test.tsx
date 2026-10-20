import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PhotocardMedia } from "./cheer-event-photocard";
let owner = "owner-a", authenticated = true, generation = 0;
const getAccessToken = vi.fn(async () => "token");
vi.mock("@privy-io/react-auth", () => ({ usePrivy: () => ({ ready:true, authenticated, user:{id:owner}, getAccessToken }) }));
vi.mock("@/components/byus-session-provider", () => ({ useByUsSession: () => ({ ready:true, ownerId:owner, generation }) }));
const asset = { id:"11111111-1111-4111-8111-111111111111", width:640, height:960 };
beforeEach(()=>{owner="owner-a";authenticated=true;generation=0;vi.stubGlobal("fetch",vi.fn(async()=>new Response(new Blob(["webp"],{type:"image/webp"}))));vi.stubGlobal("URL",{createObjectURL:vi.fn(()=>"blob:private"),revokeObjectURL:vi.fn()});});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});
it("fetches only the authenticated photocard derivative, prevents dragging and revokes on logout",async()=>{
 const view=render(<PhotocardMedia asset={asset} locale="ko" alt="창하 디지털 포토카드" />);
 const image=await screen.findByRole("img");expect(image).toHaveAttribute("src","blob:private");expect(image).toHaveAttribute("draggable","false");
 expect(fetch).toHaveBeenCalledWith(`/api/photocards/${asset.id}`,expect.objectContaining({cache:"no-store",credentials:"omit",headers:{Authorization:"Bearer token"}}));
 expect(fireEvent.contextMenu(image)).toBe(false);
 authenticated=false;generation++;view.rerender(<PhotocardMedia asset={asset} locale="ko" alt="창하 디지털 포토카드" />);
 expect(screen.queryByRole("img")).toBeNull();expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:private");
});
it("hides owner media immediately and ignores the old owner's in-flight response",async()=>{
 let finish!:(response:Response)=>void;const fetcher=vi.mocked(fetch);fetcher.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=render(<PhotocardMedia asset={asset} locale="en" alt="Changha digital photocard" />);
 await waitFor(()=>expect(fetcher).toHaveBeenCalledOnce());const signal=fetcher.mock.calls[0][1]?.signal;
 owner="owner-b";generation++;view.rerender(<PhotocardMedia asset={asset} locale="en" alt="Changha digital photocard" />);
 expect(screen.queryByRole("img")).toBeNull();expect(signal?.aborted).toBe(true);
 await screen.findByRole("img");await act(async()=>finish(new Response(new Blob(["old"]))));expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});
