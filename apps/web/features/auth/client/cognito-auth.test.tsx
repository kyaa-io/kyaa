import {act,renderHook,waitFor} from "@testing-library/react";
import{afterEach,expect,it,vi}from"vitest";
import type{ReactNode}from"react";
const mock=vi.hoisted(()=>({privy:{ready:true,authenticated:true,user:{id:"did:privy:old"},getAccessToken:vi.fn(async()=>"legacy-token"),logout:vi.fn(async()=>{})},sync:vi.fn()}));
vi.mock("@privy-io/react-auth",()=>({usePrivy:()=>mock.privy,useSubscribeToJwtAuthWithFlag:mock.sync}));
import{CognitoAuthProvider,useByUsAuth,useCognitoAuth}from"./cognito-auth";
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();vi.unstubAllGlobals();});
it.each(["request","body"])("ends a stalled session %s and permits a fresh retry without accepting the late response",async(stage)=>{
 vi.useFakeTimers();
 const value={authenticated:true,walletLinked:true,accessToken:"current-token",expiresAt:Date.now()+600000};
 let release!:()=>void;
 const stalled=new Promise<void>(resolve=>{release=resolve;});
 const fetcher=vi.fn().mockImplementationOnce(async()=>{
  if(stage==="request")await stalled;
  return {ok:true,json:async()=>{if(stage==="body")await stalled;return {...value,accessToken:"late-token"};}};
 }).mockImplementation(async()=>Response.json(value));
 vi.stubGlobal("fetch",fetcher);
 const {result}=renderHook(()=>({auth:useByUsAuth(),cognito:useCognitoAuth()}),{wrapper:({children}:{children:ReactNode})=><CognitoAuthProvider>{children}</CognitoAuthProvider>});
 await act(async()=>{await vi.advanceTimersByTimeAsync(20001);});
 expect(result.current.auth.ready).toBe(true);
 expect(result.current.auth.authenticated).toBe(false);
 await act(async()=>{await result.current.cognito.refresh();});
 expect(result.current.cognito.session?.accessToken).toBe("current-token");
 await act(async()=>{release();});
 expect(result.current.cognito.session?.accessToken).toBe("current-token");
});
it("returns the original Privy contract unchanged when Cognito is not opted in",()=>{
 expect(renderHook(()=>useByUsAuth()).result.current).toBe(mock.privy);
 expect(mock.sync).not.toHaveBeenCalled();
});
it("does not enable JWT wallet login or fan auth for an unmapped Cognito identity",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({authenticated:true,walletLinked:false,accessToken:"kyaa-cognito:access",expiresAt:Date.now()+600000})));
 const {result}=renderHook(()=>useByUsAuth(),{wrapper:({children}:{children:ReactNode})=><CognitoAuthProvider>{children}</CognitoAuthProvider>});
 await waitFor(()=>expect(result.current.ready).toBe(true));
 expect(result.current.authenticated).toBe(false);expect(result.current.user).toBeNull();
 await expect(result.current.getAccessToken()).resolves.toBeNull();
 expect(mock.sync.mock.calls.every(([value])=>value.enabled===false)).toBe(true);
});
it("uses Cognito API tokens only after preserving the existing Privy wallet owner",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({authenticated:true,walletLinked:true,accessToken:"kyaa-cognito:access",walletToken:"cognito-id",expiresAt:Date.now()+600000})));
 const {result}=renderHook(()=>useByUsAuth(),{wrapper:({children}:{children:ReactNode})=><CognitoAuthProvider>{children}</CognitoAuthProvider>});
 await waitFor(()=>expect(result.current.authenticated).toBe(true));
 expect(result.current.user?.id).toBe("did:privy:old");
 await act(async()=>{await expect(result.current.getAccessToken()).resolves.toBe("kyaa-cognito:access");});
 expect(mock.privy.getAccessToken).not.toHaveBeenCalled();
 expect(mock.sync).toHaveBeenLastCalledWith(expect.objectContaining({enabled:true,isAuthenticated:true}));
});
it("finishes Privy logout in a tab opened before the Cognito cutover",async()=>{
 const fetcher=vi.fn(async(path:string)=>path.endsWith("/logout")
  ?Response.json({logoutUrl:null})
  :Response.json({authenticated:true,walletLinked:true,accessToken:"kyaa-cognito:access",walletToken:"cognito-id",expiresAt:Date.now()+600000}));
 vi.stubGlobal("fetch",fetcher);
 const {result}=renderHook(()=>useByUsAuth(),{wrapper:({children}:{children:ReactNode})=><CognitoAuthProvider>{children}</CognitoAuthProvider>});
 await waitFor(()=>expect(result.current.authenticated).toBe(true));
 await act(async()=>{await result.current.logout();});
 expect(fetcher).toHaveBeenCalledWith("/api/auth/cognito/logout",{method:"POST"});
 expect(mock.privy.logout).toHaveBeenCalledOnce();
 expect(result.current.authenticated).toBe(false);
});
it("does not claim logout when the retired server session cannot be revoked",async()=>{
 vi.stubGlobal("fetch",vi.fn(async(path:string)=>path.endsWith("/logout")
  ?Response.json({error:{code:"AUTH_UNAVAILABLE"}},{status:503})
  :Response.json({authenticated:true,walletLinked:true,accessToken:"kyaa-cognito:access",walletToken:"cognito-id",expiresAt:Date.now()+600000})));
 const {result}=renderHook(()=>useByUsAuth(),{wrapper:({children}:{children:ReactNode})=><CognitoAuthProvider>{children}</CognitoAuthProvider>});
 await waitFor(()=>expect(result.current.authenticated).toBe(true));
 await act(async()=>{await expect(result.current.logout()).rejects.toThrow("Sign out unavailable");});
 expect(mock.privy.logout).not.toHaveBeenCalled();
 expect(result.current.authenticated).toBe(true);
});
