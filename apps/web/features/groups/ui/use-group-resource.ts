"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { clearResources, dropResource, isResourceWrite, peekResource, shareResourceRead, syncResourceOwner, useResourceEpoch, useRetainedResource } from "@/components/fan-ui/resource-cache";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { useAppLocale } from "@/components/locale-provider";

export const GROUP_WALLET_CHANGED_EVENT = "kyaa:group-wallet-changed";

export class GroupRequestError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); this.name = "GroupRequestError"; }
}

const NAME_READ_PATH=/^\/api\/groups(?:\/resolve\/[^/]+|\/[0-9a-f-]{36})?$/i;
/** Page names are chosen by the server for the page language; only read paths that return names carry it. */
export function withNameLocale(path:string,input:RequestInit|undefined,locale:string){
  if(input?.method&&input.method.toUpperCase()!=='GET')return path;
  const url=new URL(path,'https://kyaa.invalid');
  if(!NAME_READ_PATH.test(url.pathname)||url.searchParams.has('locale'))return path;
  url.searchParams.set('locale',locale);
  return `${url.pathname}${url.search}`;
}

function sameOriginApiPath(value:string){
  if(!value.startsWith('/api/')||/[\\\u0000-\u0020]/.test(value))throw new GroupRequestError(400,'GROUP_REQUEST_URL_INVALID');
  let url:URL;try{url=new URL(value,'https://kyaa.invalid');}catch{throw new GroupRequestError(400,'GROUP_REQUEST_URL_INVALID');}
  if(url.origin!=='https://kyaa.invalid'||!url.pathname.startsWith('/api/'))throw new GroupRequestError(400,'GROUP_REQUEST_URL_INVALID');
  return `${url.pathname}${url.search}`;
}

/** The path actually requested; nameLocale:false keeps stored names for screens that save them back. */
export function groupRequestPath(url:string,input:RequestInit|undefined,locale:string,nameLocale=true){
  const path=sameOriginApiPath(url);
  return nameLocale?withNameLocale(path,input,locale):path;
}

export function useGroupRequest() {
  const auth = useByUsAuth();
  const session = useByUsSession();
  const { locale } = useAppLocale();
  const { getAccessToken, authenticated } = auth;
  const ownerKey = `${auth.ready && session.ready ? authenticated ? session.ownerId ?? auth.user?.id ?? "guest" : "guest" : "pending"}:${session.generation}`;
  const identity = useRef(ownerKey);
  useLayoutEffect(() => { identity.current = ownerKey; if (!ownerKey.startsWith("pending:")) syncResourceOwner(ownerKey); }, [ownerKey]);
  const request = useCallback(async (url: string, input?: RequestInit, format: "json" | "blob" = "json", nameLocale = true) => withRequestDeadline(async signal => {
    const path=groupRequestPath(url,input,locale,nameLocale);
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
    if (isResourceWrite(input?.method, path.split('?')[0]!)) clearResources();
    const result = response.status === 204 ? null : format === "blob" ? await response.blob() : await response.json();
    if (identity.current !== ownerKey) throw new GroupRequestError(409, "SESSION_CHANGED");
    if ((input?.method && !['GET','HEAD'].includes(input.method.toUpperCase())) || path.startsWith('/api/me/wallet/requests/') || path.startsWith('/api/me/wallet/capsule-requests/')) window.dispatchEvent(new Event(GROUP_WALLET_CHANGED_EVENT));
    return result;
  }, { signal: input?.signal ?? undefined }), [auth.ready, authenticated, getAccessToken, locale, ownerKey, session.ready]);
  return { request, authenticated, ready: auth.ready && session.ready, ownerKey };
}
/** A value read in the last 30 seconds comes back at once; an older one comes back at once and is re-read behind it (`refreshing`).
 * `loading` is true only while there has never been a value. `retry` and any write drop the stored value;
 * a mounted hook keeps showing its last value and re-reads behind it. A changed owner never keeps a value.
 * nameLocale:false reads the stored page name (management screens whose forms save the name back).
 * forEdit:true is for a value a form freezes as its starting point: every opening (null to an address) reads the server and
 * shows nothing until that answer arrives, so saving an untouched form can never write an older document back. */
export function useGroupResource<T>(url: string | null, parse: (value: unknown) => T, options?: { nameLocale?: boolean; forEdit?: boolean }) {
  const nameLocale = options?.nameLocale ?? true;
  const forEdit = options?.forEdit ?? false;
  const auth = useGroupRequest();
  const { locale } = useAppLocale();
  const { request, ready, ownerKey } = auth;
  const key = `${ownerKey}:${url}`;
  const cacheKey = `${ownerKey}:${locale}:${nameLocale}:${url}`;
  const [snapshot,setSnapshot] = useState<{ key: string; version: number; epoch: number; data?: T; error: boolean; failure?:GroupRequestError }>();
  const [version,setVersion] = useState(0);
  const [openedUrl,setOpenedUrl] = useState(url);
  if (forEdit && openedUrl !== url) { setOpenedUrl(url); setSnapshot(undefined); }
  const epoch = useResourceEpoch();
  const handled = useRef({ cacheKey, version: 0, epoch });
  const shown = useRef<T | undefined>(undefined);
  const latestCacheKey = useRef(cacheKey);
  useLayoutEffect(() => { latestCacheKey.current = cacheKey; }, [cacheKey]);
  const retry = useCallback(()=>{ dropResource(latestCacheKey.current); setVersion(v=>v+1); },[]);
  const stored = ready && url && !forEdit ? peekResource(cacheKey) : undefined;
  const storedValue = useRetainedResource(cacheKey, stored?.value);
  const cached = useMemo(()=>{ if(storedValue===undefined)return undefined; try{return {data:parse(storedValue)};}catch{return undefined;} },[parse,storedValue]);
  useEffect(()=>{
    if (!ready || !url) return;
    // `retry` always reads again, even when the screen moves to another address in the same update (a cursor reset).
    const last = handled.current;
    handled.current = { cacheKey, version, epoch };
    if (!forEdit && peekResource(cacheKey)?.fresh && last.version === version) return;
    // A re-read caused only by a write elsewhere must not replace a screen that already has a value with an error.
    const behind = last.cacheKey === cacheKey && last.version === version && last.epoch !== epoch;
    const controller = new AbortController();
    void shareResourceRead(cacheKey,signal=>request(url,{signal},"json",nameLocale),controller.signal).then(value=>{if(!controller.signal.aborted)setSnapshot({key,version,epoch,data:parse(value),error:false});}).catch(error=>{if(controller.signal.aborted)return;dropResource(cacheKey);const kept=behind?shown.current:undefined;setSnapshot(kept!==undefined?{key,version,epoch,data:kept,error:false}:{key,version,epoch,error:true,failure:error instanceof GroupRequestError?error:undefined});});
    return ()=>controller.abort();
  },[cacheKey,epoch,forEdit,key,nameLocale,parse,ready,request,url,version]);
  const current = snapshot?.key === key ? snapshot : undefined;
  const data = current ? current.data : cached?.data;
  const hasValue = data !== undefined;
  useLayoutEffect(() => { shown.current = data; });
  return { ...auth, data, error: current?.error ?? false, failure:current?.failure, loading: !current && !cached && Boolean(url), refreshing: hasValue && ready && Boolean(url) && !stored?.fresh && (current?.version !== version || current.epoch !== epoch), retry };
}
