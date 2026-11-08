"use client";
import { shareResourceRead } from "@/components/fan-ui/resource-cache";
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePublicSeed } from "./public-seed";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
type Page<T> = { items: T[]; nextCursor: string | null };
type State<T> = { url: string | null; status: "loading" | "ready" | "error"; data: T[]; nextCursor: string | null; moreLoading: boolean; moreError: boolean };
export function useNewsSource<T>(url: string | null, parse: (body: unknown) => Page<T>, key: (item: T) => string, auth?: { key: string; ready: boolean; getToken: () => Promise<string | null> }) {
  const sourceId = `${url}:${auth?.key ?? "public"}`, requestReady = auth?.ready ?? true;
  const tokenProvider = useRef(auth?.getToken);
  useEffect(() => { tokenProvider.current = auth?.getToken; }, [auth?.getToken]);
  // 비로그인 읽기는 서버가 같은 주소로 미리 읽은 값이 있으면 그 값으로 첫 화면을 그리고 첫 요청을 건너뛴다.
  const seed = usePublicSeed((auth?.key ?? "public") === "public" ? url : null);
  const seeded = useMemo<State<T> | null>(() => {
    if (seed === undefined) return null;
    try {
      const page = parse(seed);
      return {url:sourceId,status:"ready",data:[...new Map(page.items.map(item => [key(item),item])).values()],nextCursor:page.nextCursor,moreLoading:false,moreError:false};
    } catch { return null; }
    // key is a module-level item key; the seed is fixed for this source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, sourceId, parse]);
  const seedUsed = useRef<string | null>(null);
  const [state, setState] = useState<State<T>>(seeded ?? {url,status:url ? "loading" : "ready",data:[],nextCursor:null,moreLoading:false,moreError:false});
  const actions = useRef({ retry: () => {}, loadMore: () => {} });
  useEffect(() => {
    let active = true;
    let busy = false;
    const fromSeed = seeded !== null && seedUsed.current !== sourceId;
    if (fromSeed) seedUsed.current = sourceId;
    let snapshot: State<T> = fromSeed && seeded ? seeded : {url:sourceId,status:url ? "loading" : "ready",data:[],nextCursor:null,moreLoading:false,moreError:false};
    let controller: AbortController | undefined;
    const commit = (next: State<T>) => { snapshot = next; if (active) setState(next); };
    const read = async (append: boolean) => {
      if (!url || !requestReady || (append && (busy || !snapshot.nextCursor))) return;
      controller?.abort();
      const current = new AbortController(); controller = current; busy = true;
      const cursor = append ? snapshot.nextCursor : null;
      commit(append ? {...snapshot,moreLoading:true,moreError:false} : {...snapshot,status:"loading",data:[],nextCursor:null,moreLoading:false,moreError:false});
      try {
        const address = cursor ? `${url}${url.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}` : url;
        const readBody = (flight: AbortSignal) => withRequestDeadline(async signal => {
          const token = tokenProvider.current ? await tokenProvider.current() : null;
          throwIfAborted(signal);
          const response = await fetch(address,{signal,cache:"no-store",credentials:"omit",headers:token ? {Authorization:`Bearer ${token}`} : undefined});
          if (!response.ok) throw Error();
          return response.json() as Promise<unknown>;
        }, { signal: flight });
        // Sources on one screen that read the same address join one request; each parses the body its own way.
        const body = await shareResourceRead(`news:${sourceId}:${address}`, readBody, current.signal);
        const page = parse(body);
        if (current.signal.aborted || !active) return;
        if (page.nextCursor && page.nextCursor === cursor) throw Error("Cursor did not advance");
        const data = new Map((append ? snapshot.data : []).map(item => [key(item),item]));
        page.items.forEach(item => data.set(key(item),item));
        commit({...snapshot,status:"ready",data:[...data.values()],nextCursor:page.nextCursor,moreLoading:false,moreError:false});
      } catch {
        if (!current.signal.aborted && active) commit(append ? {...snapshot,moreLoading:false,moreError:true} : {...snapshot,status:"error",data:[],nextCursor:null,moreLoading:false});
      } finally { if (!current.signal.aborted) busy = false; }
    };
    commit(snapshot);
    actions.current = {retry:()=>{void read(false);},loadMore:()=>{void read(true);}};
    if (url && !fromSeed) void read(false);
    // Refresh from page one; never keep older pages across visibility revalidation.
    const refresh = () => { if (!document.hidden) void read(false); };
    const timer = window.setInterval(refresh,900_000);
    document.addEventListener("visibilitychange",refresh);
    return () => {active=false;controller?.abort();window.clearInterval(timer);document.removeEventListener("visibilitychange",refresh);};
  },[url,parse,key,sourceId,requestReady,seeded]);
  return {state:state.url === sourceId ? state : seeded ?? {url:sourceId,status:url ? "loading" as const : "ready" as const,data:[],nextCursor:null,moreLoading:false,moreError:false},retry:()=>actions.current.retry(),loadMore:()=>actions.current.loadMore()};
}
