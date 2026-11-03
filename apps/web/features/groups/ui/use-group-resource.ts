"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";

export const GROUP_WALLET_CHANGED_EVENT = "kyaa:group-wallet-changed";

export class GroupRequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); this.name = "GroupRequestError"; }
}

function sameOriginApiPath(value:string){
  if(!value.startsWith('/api/')||/[\\\u0000-\u0020]/.test(value))throw new GroupRequestError(400,'GROUP_REQUEST_URL_INVALID');
  let url:URL;try{url=new URL(value,'https://kyaa.invalid');}catch{throw new GroupRequestError(400,'GROUP_REQUEST_URL_INVALID');}
  if(url.origin!=='https://kyaa.invalid'||!url.pathname.startsWith('/api/'))throw new GroupRequestError(400,'GROUP_REQUEST_URL_INVALID');
  return `${url.pathname}${url.search}`;
}

export function useGroupRequest() {
  const auth = useByUsAuth();
  const session = useByUsSession();
  const { getAccessToken, authenticated } = auth;
  const ownerKey = `${auth.ready && session.ready ? authenticated ? session.ownerId ?? auth.user?.id ?? "guest" : "guest" : "pending"}:${session.generation}`;
  const identity = useRef(ownerKey);
  useLayoutEffect(() => { identity.current = ownerKey; }, [ownerKey]);
  const request = useCallback(async (url: string, input?: RequestInit, format: "json" | "blob" = "json") => withRequestDeadline(async signal => {
    const path=sameOriginApiPath(url);
    if (!auth.ready || !session.ready) throw new GroupRequestError(409, "SESSION_NOT_READY");
    const token = authenticated ? await getAccessToken() : null;
    if (identity.current !== ownerKey) throw new GroupRequestError(409, "SESSION_CHANGED");
    if (authenticated && !token) throw new GroupRequestError(401, "AUTH_REQUIRED");
    const response = await fetch(path, { ...input, signal, cache: "no-store", headers: { ...(input?.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...input?.headers } });
    if (!response.ok) {
      const failure: unknown = await response.json().catch(() => null);
      const code = typeof failure === "object" && failure !== null && "error" in failure && typeof failure.error === "object" && failure.error !== null && "code" in failure.error && typeof failure.error.code === "string" ? failure.error.code : "REQUEST_FAILED";
      throw new GroupRequestError(response.status, code);
    }
    const result = response.status === 204 ? null : format === "blob" ? await response.blob() : await response.json();
    if (identity.current !== ownerKey) throw new GroupRequestError(409, "SESSION_CHANGED");
    if ((input?.method && !['GET','HEAD'].includes(input.method.toUpperCase())) || path.startsWith('/api/me/wallet/requests/') || path.startsWith('/api/me/wallet/capsule-requests/')) window.dispatchEvent(new Event(GROUP_WALLET_CHANGED_EVENT));
    return result;
  }, { signal: input?.signal ?? undefined }), [auth.ready, authenticated, getAccessToken, ownerKey, session.ready]);
  return { request, authenticated, ready: auth.ready && session.ready, ownerKey };
}
export function useGroupResource<T>(url: string | null, parse: (value: unknown) => T) {
  const auth = useGroupRequest();
  const { request, ready, ownerKey } = auth;
  const key = `${ownerKey}:${url}`;
  const [snapshot,setSnapshot] = useState<{ key: string; data?: T; error: boolean; failure?:GroupRequestError }>();
  const [version,setVersion] = useState(0);
  const retry = useCallback(()=>setVersion(v=>v+1),[]);
  useEffect(()=>{
    if (!ready || !url) return;
    const controller = new AbortController();
    void request(url,{signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setSnapshot({key,data:parse(value),error:false});}).catch(error=>{if(!controller.signal.aborted)setSnapshot({key,error:true,failure:error instanceof GroupRequestError?error:undefined});});
    return ()=>controller.abort();
  },[key,parse,ready,request,url,version]);
  const current = snapshot?.key === key ? snapshot : undefined;
  return { ...auth, data: current?.data, error: current?.error ?? false, failure:current?.failure, loading: !current && Boolean(url), retry };
}
