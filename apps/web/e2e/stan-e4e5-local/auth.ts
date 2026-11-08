import {useSyncExternalStore} from 'react';
// Signed-in state with the token of a local test login (kyaa-t3 local-login), injected by run.mjs; `?auth=off` is a guest.
const query=new URLSearchParams(location.search);
const token=():string|null=>(window as unknown as {__stanToken?:string}).__stanToken??null;
const session={ready:true,authenticated:query.get('auth')!=='off',ownerId:'local-test-owner',generation:1};
const subscribe=()=>()=>{};
const snapshot=()=>session;
const getAccessToken=async()=>token();
export function useByUsAuth(){const s=useSyncExternalStore(subscribe,snapshot);return {...s,user:{id:s.ownerId},getAccessToken};}
export const usePrivy=useByUsAuth;
export function useByUsSession(){const s=useSyncExternalStore(subscribe,snapshot);return {...s,pending:false,error:null,destination:null,ownerId:s.authenticated?s.ownerId:null};}
export const useAdminSession=()=>({status:'unauthorized',admin:null});
export const useUser=()=>({user:{id:session.ownerId},refreshUser:async()=>({id:session.ownerId})});
export const useLinkWithOAuth=()=>({initOAuth:async()=>{throw Error('OAuth unavailable in local harness');},loading:false,state:{status:'initial'}});
