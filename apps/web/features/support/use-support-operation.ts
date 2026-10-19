"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { z } from "zod";
import { cancelledSchema, exchangeSchema, supportSchema, supportCancellationSchema, unknownSchema } from "@/server/mobile-fan-economy/domain";
export const SUPPORT_HEADERS = Object.freeze({ "X-Kyaa-Asset-Contract": "support-v1" });
const inputSchema = z.object({ celebritySlug:z.string().min(1), policyVersion:z.string().min(1), units:z.number().int().min(1).max(1000), target:z.enum(["support_voucher","free_draw"]).optional() }).strict();
export const pendingSupportSchema = z.object({requestKey:z.uuid(),operation:z.enum(["exchange","support"]),input:inputSchema}).strict().refine(v => v.operation === "exchange" ? v.input.target !== undefined : v.input.target === undefined);
export type PendingSupport = z.infer<typeof pendingSupportSchema>;
const resultSchema = z.union([exchangeSchema,supportSchema,cancelledSchema,unknownSchema]);
export function supportStorageKey(owner:string,slug:string,target:"support_voucher"|"free_draw"="support_voucher") { return `kyaa:support:v1:${encodeURIComponent(owner)}:${encodeURIComponent(slug)}${target==="free_draw"?":free_draw":""}`; }
export function useSupportOperation(owner:string|null, slug:string, getToken:()=>Promise<string|null>, onComplete:()=>void, exchangeTarget:"support_voucher"|"free_draw"="support_voucher") {
  const identity = `${owner ?? ""}:${slug}:${exchangeTarget}`;
  const current=useRef({identity,active:false});
  const [state,setState] = useState<{identity:string; pending:PendingSupport|null; busy:boolean; error:boolean; complete:boolean}>({identity,pending:null,busy:false,error:false,complete:false});
  const lock = useRef(false);
  const key = owner ? supportStorageKey(owner,slug,exchangeTarget) : null;
  useLayoutEffect(()=>{
    const runtime={identity,active:true};
    current.current=runtime;
    lock.current=false;
    let pending:PendingSupport|null=null; let error=false;
    try { const raw=key ? localStorage.getItem(key):null; if(raw) pending=pendingSupportSchema.parse(JSON.parse(raw)); if(pending && (pending.input.celebritySlug!==slug || (pending.operation==="exchange" && pending.input.target!==exchangeTarget) || (exchangeTarget==="free_draw" && pending.operation!=="exchange"))) throw Error(); }
    catch { pending=null;error=true; }
    setState({identity,pending,busy:false,error,complete:false});
    return ()=>{runtime.active=false;};
  },[identity,key,slug,exchangeTarget]);
  const visible=state.identity===identity ? state : {identity,pending:null,busy:false,error:false,complete:false};
  async function run(mode:"submit"|"status"|"retry"|"cancel", proposed?:PendingSupport) {
    const runtime=current.current;
    if(runtime.identity!==identity || !runtime.active || !owner || !key || lock.current || (proposed && (visible.pending || visible.error))) return;
    const pending=proposed ?? visible.pending;
    if(!pending || (exchangeTarget==="free_draw" && pending.operation!=="exchange")) return;
    lock.current=true;
    const valid=()=>current.current===runtime&&runtime.active;
    try {
      const stored=localStorage.getItem(key);
      if(proposed && stored) {
        const existing=pendingSupportSchema.parse(JSON.parse(stored));
        if(valid()) setState({identity,pending:existing,busy:false,error:true,complete:false});
        return;
      }
      // Persist before any request; a lost response must keep its original key and payload.
      localStorage.setItem(key,JSON.stringify(pendingSupportSchema.parse(pending)));
      if(!valid()) return;
      setState({identity,pending,busy:true,error:false,complete:false});
      const token=await getToken(); if(!valid()) return; if(!token) throw Error();
      const base="/api/me/mobile-fan-economy";
      const url=mode==="cancel" ? `${base}/requests/${pending.requestKey}/cancel` : mode==="status" ? `${base}/${pending.operation}/${pending.requestKey}` : `${base}/${pending.operation}`;
      const response=await fetch(url,{method:mode==="status"?"GET":"POST",headers:{...SUPPORT_HEADERS,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},cache:"no-store",signal:AbortSignal.timeout(20000),...(mode==="status"?{}:{body:JSON.stringify(mode==="cancel"?{operation:pending.operation,input:pending.input}:{requestKey:pending.requestKey,...pending.input})})});
      if(!valid()) return;
      if(!response.ok) throw Error();
      const body=await response.json(); if(!valid()) return;
      const parsed=mode==="cancel" ? supportCancellationSchema.parse(body) : resultSchema.parse(body);
      const result="status" in parsed && parsed.status==="committed" ? parsed.result : parsed;
      if("status" in result && result.status==="unknown") throw Error();
      if(!("requestKey" in result) || result.requestKey!==pending.requestKey) throw Error();
      if("status" in result) { if(result.operation!==pending.operation) throw Error(); }
      else if(result.policyVersion!==pending.input.policyVersion || !("units" in result) || result.units!==pending.input.units || (pending.operation==="exchange" ? !("target" in result) || result.target!==pending.input.target : !("voucherLedgerId" in result))) throw Error();
      const saved=localStorage.getItem(key);
      if(saved && pendingSupportSchema.parse(JSON.parse(saved)).requestKey===pending.requestKey) localStorage.removeItem(key);
      if(valid()) {setState({identity,pending:null,busy:false,error:false,complete:true});onComplete();}
    } catch { if(valid()) setState({identity,pending,busy:false,error:true,complete:false}); }
    finally {if(valid()) lock.current=false;}
  }
  return {...visible, submit:(operation:PendingSupport["operation"],policyVersion:string,units:number)=>run("submit",{requestKey:crypto.randomUUID(),operation,input:{celebritySlug:slug,policyVersion,units,...(operation==="exchange"?{target:exchangeTarget}:{})}}), reconcile:()=>run("status"), retry:()=>run("retry"), cancel:()=>run("cancel")};
}
