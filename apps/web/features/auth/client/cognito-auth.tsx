"use client";
import { usePrivy } from "@/features/auth/client/privy-backend";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";

interface Session { authenticated: boolean; walletLinked: boolean; userId?: string; accessToken: string; expiresAt: number }
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
  const value=useMemo(()=>({enabled:true,loading,session,refresh,logout,getAccessToken}),[loading,session,refresh,logout,getAccessToken]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * The app's one auth hook. With CognitoAuthProvider (every page since PRIVY-EXIT-0005) it reads kyaa's own server session
 * only: no Privy SDK state, token or network call decides sign-in. user.id is the member's identity key (did:privy:… for
 * members from before the move, kyaa:<uuid> after), the same value the server resolves from the Bearer token.
 * Without the provider (isolated component tests only) it returns the legacy SDK hook unchanged.
 */
export function useByUsAuth(): ReturnType<typeof usePrivy>{
  const privy=usePrivy(),cognito=useCognitoAuth();
  const {logout:cognitoLogout,session,loading,getAccessToken}=cognito;
  const logout=useCallback(async()=>{const destination=await cognitoLogout();if(destination)window.location.assign(destination);},[cognitoLogout]);
  const authenticated=session?.authenticated===true && session.walletLinked===true && typeof session.userId==="string";
  const userId=authenticated?session!.userId!:null;
  const user=useMemo(()=>userId?{id:userId,linkedAccounts:[]} as unknown as NonNullable<ReturnType<typeof usePrivy>["user"]>:null,[userId]);
  if(!cognito.enabled)return privy;
  return {...privy,ready:!loading,authenticated,user,getAccessToken,logout};
}
