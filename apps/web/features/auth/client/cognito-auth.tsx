"use client";
import { usePrivy, useSubscribeToJwtAuthWithFlag } from "@privy-io/react-auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

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
      const response=await fetch("/api/auth/cognito/session",{cache:"no-store"});
      if(expectedRevision!==revision.current)return current.current;
      if(!response.ok){if(response.status===401){current.current=null;setSession(null);return null;}throw new Error("Authentication unavailable");}
      const value=await response.json() as Session;
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

/** Keeps existing UI and Bearer call sites while Cognito becomes the primary API credential. */
export function useByUsAuth(): ReturnType<typeof usePrivy>{
  const privy=usePrivy(),cognito=useCognitoAuth();
  const logout=useCallback(async()=>{const destination=await cognito.logout();await privy.logout();if(destination)window.location.assign(destination);},[cognito,privy]);
  if(!cognito.enabled)return privy;
  const authenticated=cognito.session?.walletLinked===true && privy.authenticated;
  return {...privy,ready:privy.ready&&!cognito.loading,authenticated,user:authenticated?privy.user:null,getAccessToken:cognito.getAccessToken,logout};
}
