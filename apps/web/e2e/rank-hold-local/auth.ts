import {useSyncExternalStore} from 'react';
const query=new URLSearchParams(location.search);
let session={ready:query.get('state')!=='restoring',authenticated:query.get('auth')!=='off',ownerId:'synthetic-owner-a',generation:1};
const listeners=new Set<()=>void>();
const subscribe=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
export function transition(next:Partial<typeof session>){session={...session,...next,generation:session.generation+1};listeners.forEach(fn=>fn());}
export const sessionSnapshot=()=>session;
const getAccessToken=async()=>session.ownerId;
export function useByUsAuth(){const s=useSyncExternalStore(subscribe,sessionSnapshot);return {...s,user:{id:s.ownerId},getAccessToken};}
export const usePrivy=useByUsAuth;
export const usePublicReadAuth=useByUsAuth;
export function useByUsSession(){const s=useSyncExternalStore(subscribe,sessionSnapshot);return {...s,pending:!s.ready,error:null,destination:null,ownerId:s.authenticated?s.ownerId:null};}
export const useAdminSession=()=>({status:'unauthorized',admin:null});
export const useUser=()=>({user:{id:session.ownerId},refreshUser:async()=>({id:session.ownerId})});
export const useLinkWithOAuth=()=>({initOAuth:async()=>{throw Error('OAuth unavailable in local fixture');},loading:false,state:{status:'initial'}});
