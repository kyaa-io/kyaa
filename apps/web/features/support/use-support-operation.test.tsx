import { useLayoutEffect } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { supportStorageKey, useSupportOperation } from "./use-support-operation";
const uuid="11111111-1111-4111-8111-111111111111";
const token=async()=>"token";
const receipt=(requestKey:string)=>({requestKey,celebrityId:uuid,units:2,supportKrw:200,voucherLedgerId:uuid,policyVersion:"v1",createdAt:"2026-10-19T00:00:00Z",replayed:false});
beforeEach(()=>localStorage.clear());afterEach(()=>vi.unstubAllGlobals());
describe("durable support operations",()=>{
 it("persists before POST, blocks duplicate clicks and reuses the exact key after an unknown outcome",async()=>{
  let resolve!:(r:Response)=>void;
  const fetcher=vi.fn().mockImplementationOnce(()=>new Promise<Response>(r=>{resolve=r;}));vi.stubGlobal("fetch",fetcher);
  const done=vi.fn();const {result,unmount}=renderHook(()=>useSupportOperation("owner","kara",token,done));
  let submit!:Promise<void>;
  act(()=>{submit=result.current.submit("support","v1",2);void result.current.submit("support","v1",2);});
  await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1));
  const stored=JSON.parse(localStorage.getItem(supportStorageKey("owner","kara"))!);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({requestKey:stored.requestKey,...stored.input});
  await act(async()=>{resolve(Response.json({status:"unknown"}));await submit;});
  expect(result.current.pending?.requestKey).toBe(stored.requestKey);unmount();
  fetcher.mockResolvedValueOnce(Response.json({status:"unknown"})).mockResolvedValueOnce(Response.json(receipt(stored.requestKey)));
  const restored=renderHook(()=>useSupportOperation("owner","kara",token,done));
  await act(async()=>{await restored.result.current.reconcile();});
  expect(fetcher.mock.calls[1][0]).toContain(`/support/${stored.requestKey}`);
  await act(async()=>{await restored.result.current.retry();});
  expect(JSON.parse(fetcher.mock.calls[2][1].body)).toEqual(JSON.parse(fetcher.mock.calls[0][1].body));
  expect(localStorage.getItem(supportStorageKey("owner","kara"))).toBeNull();expect(done).toHaveBeenCalledTimes(1);
 });
 it("hides another owner's pending request and ignores a late result",async()=>{
  let resolve!:(r:Response)=>void;vi.stubGlobal("fetch",vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
  const done=vi.fn();const {result,rerender}=renderHook(({owner})=>useSupportOperation(owner,"kara",token,done),{initialProps:{owner:"a"}});
  let submit!:Promise<void>;act(()=>{submit=result.current.submit("support","v1",2);});
  await waitFor(()=>expect(result.current.busy).toBe(true));const saved=JSON.parse(localStorage.getItem(supportStorageKey("a","kara"))!);
  rerender({owner:"b"});expect(result.current.pending).toBeNull();
  await act(async()=>{resolve(Response.json(receipt(saved.requestKey)));await submit;});
  expect(done).not.toHaveBeenCalled();expect(localStorage.getItem(supportStorageKey("a","kara"))).not.toBeNull();
 });
 it("does not send if durable storage fails",async()=>{
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);vi.stubGlobal("localStorage",{getItem:()=>null,setItem:()=>{throw Error("full");}});
  const {result}=renderHook(()=>useSupportOperation("a","kara",token,vi.fn()));
  await act(async()=>{await result.current.submit("exchange","v1",2);});
  expect(fetcher).not.toHaveBeenCalled();expect(result.current.error).toBe(true);
 });
 it("cancels with the original input even after policy changes",async()=>{
  const pending={requestKey:uuid,operation:"exchange",input:{celebritySlug:"kara",policyVersion:"old",units:2,target:"support_voucher"}};
  localStorage.setItem(supportStorageKey("a","kara"),JSON.stringify(pending));const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>Response.json({status:"cancelled",requestKey:uuid,operation:"exchange"}));vi.stubGlobal("fetch",fetcher);
  const {result}=renderHook(()=>useSupportOperation("a","kara",token,vi.fn()));await act(async()=>{await result.current.cancel();});
  expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string)).toEqual({operation:"exchange",input:pending.input});expect(result.current.pending).toBeNull();
 });
 it("does not exchange for the old owner when a new keyed owner resolves the token in layout",async()=>{
  let resolveToken!:(value:string)=>void;
  const pendingToken=new Promise<string>(resolve=>{resolveToken=resolve;});
  const fetcher=vi.fn();vi.stubGlobal("fetch",fetcher);
  const done=vi.fn();let operation!:ReturnType<typeof useSupportOperation>;
  function Owner({owner}:{owner:string}) {
   operation=useSupportOperation(owner,"kara",()=>pendingToken,done);
   useLayoutEffect(()=>{if(owner==="b")resolveToken("token-for-b");},[owner]);
   return null;
  }
  const view=render(<Owner key="a" owner="a"/>);
  let submit!:Promise<void>;act(()=>{submit=operation.submit("exchange","v1",2);});
  await act(async()=>{view.rerender(<Owner key="b" owner="b"/>);});
  await submit;
  expect(fetcher).not.toHaveBeenCalled();expect(done).not.toHaveBeenCalled();
  expect(localStorage.getItem(supportStorageKey("a","kara"))).not.toBeNull();
  expect(localStorage.getItem(supportStorageKey("b","kara"))).toBeNull();
 });
});
