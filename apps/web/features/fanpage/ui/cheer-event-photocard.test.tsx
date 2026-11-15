import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PhotocardMedia, PhotocardReward } from "./cheer-event-photocard";
import type { PhotocardClaim } from "../domain/photocard-claim";
import { photocardClaimCopy } from "../domain/photocard-claim-copy";
import { APP_LOCALES } from "@/i18n/locales";
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

const collectionId="22222222-2222-4222-8222-222222222222";
const options=["아야 (AYA)","도아 (DOA)","희 (HEE)","원이 (WONY)"].map((title,i)=>({id:`33333333-3333-4333-8333-33333333333${i}`,title}));
const empty:PhotocardClaim={mode:"member_pair",ready:true,selectedBundleId:null,options,assets:[]};
const cards=Array.from({length:3},(_,i)=>({...asset,id:`44444444-4444-4444-8444-44444444444${i}`}));
const reward={collectionId,title:"미공개 디지털 포토카드",eligible:true,assets:[]};
function mockClaims(initial:PhotocardClaim=empty) {
 let state=initial;
 const fetcher=vi.mocked(fetch).mockImplementation(async(url,init)=>{
  if(String(url).startsWith("/api/photocards/")) return new Response(new Blob(["webp"],{type:"image/webp"}));
  if(init?.method==="POST") state={...state,selectedBundleId:state.mode==="member_pair"?JSON.parse(String(init.body)).bundleId:options[2].id,assets:cards.slice(0,state.mode==="member_pair"?2:3)};
  return Response.json(state);
 });
 return fetcher;
}
it("requires a member choice, claims two cards, and opens only the received pair",async()=>{
 const fetcher=mockClaims();render(<PhotocardReward photocard={reward} locale="ko" name="We;Na" />);
 const claim=await screen.findByRole("button",{name:"포토카드 2장 받기"});expect(claim).toBeDisabled();
 fireEvent.click(screen.getByRole("radio",{name:"희 (HEE)"}));expect(claim).toBeEnabled();fireEvent.click(claim);
 const view=await screen.findByRole("button",{name:"포토카드 보기"});expect(view).toHaveFocus();
 const post=fetcher.mock.calls.find(([,init])=>init?.method==="POST");
 expect(post).toEqual([`/api/photocard-collections/${collectionId}/claim`,expect.objectContaining({credentials:"omit",cache:"no-store",body:JSON.stringify({bundleId:options[2].id}),headers:{Authorization:"Bearer token","content-type":"application/json"}})]);
 expect(screen.queryByRole("radio")).toBeNull();fireEvent.click(view);
 expect(await screen.findAllByRole("img")).toHaveLength(2);expect(screen.queryByRole("button",{name:/download|다운로드/i})).toBeNull();
 fireEvent.keyDown(document,{key:"Escape"});await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());await waitFor(()=>expect(view).toHaveFocus());
});
it("claims a random three-card set without sending a chosen bundle and restores it on return",async()=>{
 const fetcher=mockClaims({...empty,mode:"random_three",options:[]});
 const v=render(<PhotocardReward photocard={reward} locale="ko" name="CHANGHA" />);
 fireEvent.click(await screen.findByRole("button",{name:"랜덤 포토카드 3장 받기"}));
 fireEvent.click(await screen.findByRole("button",{name:"포토카드 보기"}));expect(await screen.findAllByRole("img")).toHaveLength(3);
 expect(fetcher.mock.calls.filter(([,i])=>i?.method==="POST")).toHaveLength(1);
 expect(fetcher.mock.calls.find(([,i])=>i?.method==="POST")?.[1]?.body).toBe("{}");
 v.unmount();render(<PhotocardReward photocard={reward} locale="ko" name="CHANGHA" />);
 await screen.findByRole("button",{name:"포토카드 보기"});expect(screen.queryByRole("button",{name:"랜덤 포토카드 3장 받기"})).toBeNull();
 expect(fetcher.mock.calls.filter(([,i])=>i?.method==="POST")).toHaveLength(1);
});
it("reconciles a committed claim when the POST response is lost",async()=>{
 let claimed=false;const fetcher=vi.mocked(fetch).mockImplementation(async(_url,init)=>{
  if(init?.method==="POST"){claimed=true;throw new TypeError("Network response lost");}
  return Response.json(claimed?{...empty,selectedBundleId:options[0].id,assets:cards.slice(0,2)}:empty);
 });
 render(<PhotocardReward photocard={reward} locale="ko" name="We;Na" />);
 fireEvent.click(await screen.findByRole("radio",{name:"아야 (AYA)"}));fireEvent.click(screen.getByRole("button",{name:"포토카드 2장 받기"}));
 await screen.findByRole("button",{name:"포토카드 보기"});expect(fetcher).toHaveBeenCalledTimes(3);expect(screen.queryByRole("radio")).toBeNull();
});
it("aborts an old owner's pending claim and does not show its result to the next owner",async()=>{
 let finish!:(value:Response)=>void;const fetcher=vi.mocked(fetch).mockImplementation(async(_url,init)=>init?.method==="POST"?new Promise(resolve=>{finish=resolve;}):Response.json(empty));
 const v=render(<PhotocardReward photocard={reward} locale="ko" name="We;Na" />);
 fireEvent.click(await screen.findByRole("radio",{name:"아야 (AYA)"}));fireEvent.click(screen.getByRole("button",{name:"포토카드 2장 받기"}));
 await waitFor(()=>expect(fetcher.mock.calls.some(([,i])=>i?.method==="POST")).toBe(true));
 const signal=fetcher.mock.calls.find(([,i])=>i?.method==="POST")?.[1]?.signal;
 owner="owner-b";generation++;v.rerender(<PhotocardReward photocard={reward} locale="ko" name="We;Na" />);expect(signal?.aborted).toBe(true);
 await act(async()=>finish(Response.json({...empty,selectedBundleId:options[0].id,assets:cards.slice(0,2)})));
 await screen.findByRole("radio",{name:"아야 (AYA)"});expect(screen.queryByRole("button",{name:"포토카드 보기"})).toBeNull();
});
it("refetches a different collection, rejects malformed responses, and retries with a read only",async()=>{
 const fetcher=vi.mocked(fetch).mockResolvedValueOnce(Response.json({...empty,storagePath:"private/original.png"})).mockImplementation(async()=>Response.json({...empty,ready:false,options:[]}));
 const v=render(<PhotocardReward photocard={reward} locale="ko" name="We;Na" />);
 fireEvent.click(await screen.findByRole("button",{name:"다시 확인"}));await screen.findByText("포토카드 준비 중");
 const nextId="55555555-5555-4555-8555-555555555555";
 v.rerender(<PhotocardReward photocard={{...reward,collectionId:nextId}} locale="ko" name="We;Na" />);
 await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>String(url).includes(nextId))).toBe(true));
 expect(fetcher.mock.calls.every(([,init])=>!init?.method)).toBe(true);
});
it("does not load claim state for a nonparticipant or a logged-out owner",()=>{
 render(<PhotocardReward photocard={{...reward,eligible:false}} locale="ko" name="We;Na" />);expect(fetch).not.toHaveBeenCalled();
 cleanup();authenticated=false;render(<PhotocardReward photocard={reward} locale="ko" name="We;Na" />);expect(fetch).not.toHaveBeenCalled();
});
it("keeps an empty legacy collection in preparation instead of offering a random claim",async()=>{
 mockClaims({...empty,mode:"all",ready:true,options:[]});render(<PhotocardReward photocard={reward} locale="ko" name="We;Na" />);
 await screen.findByText("포토카드 준비 중");expect(screen.queryByRole("button",{name:"랜덤 포토카드 3장 받기"})).toBeNull();
});
it("has complete claim copy in every supported locale",()=>{
 for(const locale of APP_LOCALES)expect(Object.values(photocardClaimCopy(locale))).toHaveLength(7);
 for(const locale of APP_LOCALES)for(const value of Object.values(photocardClaimCopy(locale)))expect(value.trim().length).toBeGreaterThan(0);
});
