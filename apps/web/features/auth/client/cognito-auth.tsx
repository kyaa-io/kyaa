"use client";
import { usePrivy, useSubscribeToJwtAuthWithFlag } from "@/features/auth/client/privy-backend";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { clearFanSession, FAN_SESSION_BEARER, PRIVY_WAIT_MS, readFanSessionHint, withPrivyDeadline } from "@/features/auth/client/fan-session";

interface Session { authenticated: boolean; walletLinked: boolean; accessToken: string; walletToken?: string; expiresAt: number; enrollment?: { mode: "new" | "recovery" | "blocked"; provider?: "google" | "apple" } }
interface CognitoAuth { enabled: boolean; loading: boolean; session: Session | null; refresh(): Promise<Session | null>; logout(): Promise<string|null>; getAccessToken(): Promise<string | null> }
const Context=createContext<CognitoAuth>({enabled:false,loading:false,session:null,refresh:async()=>null,logout:async()=>null,getAccessToken:async()=>null});
export const useCognitoAuth=()=>useContext(Context);

export function CognitoAuthProvider({children}:{children:ReactNode}){
  const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true);
  const revision=useRef(0);
  const current=useRef<Session|null>(null),pending=useRef<Promise<Session|null>|null>(null);
  const refresh=useCallback(():Promise<Session|null>=>{
    if(pending.current)return pending.current;
    const expectedRevision=revision.current;
    const request=(async()=>{
      const {response,value}=await withRequestDeadline(async(signal)=>{
        const response=await fetch("/api/auth/cognito/session",{cache:"no-store",signal});
        return {response,value:response.ok?await response.json():null};
      });
      if(expectedRevision!==revision.current)return current.current;
      if(!response.ok){if(response.status===401){current.current=null;setSession(null);return null;}throw new Error("Authentication unavailable");}
      if(value.authenticated!==true || typeof value.walletLinked!=="boolean" || typeof value.accessToken!=="string" || typeof value.expiresAt!=="number")throw new Error("Invalid authentication response");
      if(expectedRevision!==revision.current)return current.current;
      current.current=value;setSession(value);return value;
    })();
    pending.current=request;
    void request.finally(()=>{pending.current=null;}).catch(()=>{});
    return request;
  },[]);
  useEffect(()=>{void refresh().catch(()=>{}).finally(()=>setLoading(false));},[refresh]);
  const getAccessToken=useCallback(async()=>{
    const value=current.current && current.current.expiresAt>Date.now()+30_000?current.current:await refresh();
    return value?.walletLinked?value.accessToken:null;
  },[refresh]);
  const logout=useCallback(async()=>{
    const response=await fetch("/api/auth/cognito/logout",{method:"POST"});
    if(!response.ok)throw new Error("Sign out unavailable");
    revision.current+=1;current.current=null;setSession(null);
    const value=await response.json();
    return typeof value.logoutUrl==="string"?value.logoutUrl:null;
  },[]);
  const getExternalJwt=useCallback(async()=>{
    const value=current.current && current.current.expiresAt>Date.now()+30_000?current.current:await refresh();
    return value?.walletLinked?value.walletToken:undefined;
  },[refresh]);
  // Never start JWT wallet authentication before the server confirms the existing DID/address mapping.
  useSubscribeToJwtAuthWithFlag({enabled:session?.walletLinked===true,isAuthenticated:session?.authenticated===true,isLoading:loading,getExternalJwt});
  const value=useMemo(()=>({enabled:true,loading,session,refresh,logout,getAccessToken}),[loading,session,refresh,logout,getAccessToken]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

type PrivyAuth = ReturnType<typeof usePrivy>;

/** Stand-in for Privy's user while Privy is stalled: only the DID is known, and that is all most screens read. */
function stalledUser(pid: string): NonNullable<PrivyAuth["user"]> {
  return { id: pid, createdAt: new Date(0), linkedAccounts: [], mfaMethods: [], hasAcceptedTerms: true, isGuest: false } as unknown as NonNullable<PrivyAuth["user"]>;
}

/** Keeps existing UI and Bearer call sites while Cognito becomes the primary API credential. */
export function useByUsAuth(): PrivyAuth{
  const privy=usePrivy(),cognito=useCognitoAuth();
  const privyReady=privy.ready;
  // Only a browser that holds our fan session changes anything here; everyone else gets Privy's contract untouched.
  const hintPid=cognito.enabled?null:readFanSessionHint()?.pid??null;
  const [stalled,setStalled]=useState(false);
  useEffect(()=>{
    if(privyReady||!hintPid){setStalled(false);return;}
    const timer=setTimeout(()=>setStalled(true),PRIVY_WAIT_MS);
    return()=>clearTimeout(timer);
  },[privyReady,hintPid]);
  const sessionPid=privyReady?privy.user?.id??null:hintPid;
  const bounded=useMemo<PrivyAuth>(()=>hintPid&&sessionPid===hintPid
    ?{...privy,getAccessToken:()=>withPrivyDeadline(privy.getAccessToken,hintPid)}:privy,[privy,hintPid,sessionPid]);
  // Privy has not loaded after PRIVY_WAIT_MS: a fan with our session goes on as signed in, with the cookie as credential.
  const stalledAuth=useMemo<PrivyAuth|null>(()=>stalled&&hintPid?{...privy,ready:true,authenticated:true,user:stalledUser(hintPid),
    getAccessToken:async()=>FAN_SESSION_BEARER,logout:async()=>{clearFanSession();await privy.logout();}}:null,[privy,stalled,hintPid]);
  const logout=useCallback(async()=>{const destination=await cognito.logout();await privy.logout();if(destination)window.location.assign(destination);},[cognito,privy]);
  if(!cognito.enabled)return !privyReady&&stalledAuth?stalledAuth:bounded;
  const authenticated=cognito.session?.walletLinked===true && privy.authenticated;
  return {...privy,ready:privy.ready&&!cognito.loading,authenticated,user:authenticated?privy.user:null,getAccessToken:cognito.getAccessToken,logout};
}
