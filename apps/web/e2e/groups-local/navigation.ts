import { useSyncExternalStore } from 'react';
const eventName='groups-query-change';
const replace=window.history.replaceState.bind(window.history),push=window.history.pushState.bind(window.history);
window.history.replaceState=(...args)=>{replace(...args);window.dispatchEvent(new Event(eventName));};
window.history.pushState=(...args)=>{push(...args);window.dispatchEvent(new Event(eventName));};
export const subscribeRoute=(listener:()=>void)=>{window.addEventListener(eventName,listener);window.addEventListener('popstate',listener);return()=>{window.removeEventListener(eventName,listener);window.removeEventListener('popstate',listener);};};
export function isClientFanRoute(url:URL){return url.origin===location.origin&&/^\/(nchive|elina|pages\/groups\/e9200000-0000-4000-8000-00000000000[12])\/?$/.test(url.pathname);}
function navigate(href:string,replaceRoute=false){
 const url=new URL(href,location.href);
 if(!isClientFanRoute(new URL(location.href))||!isClientFanRoute(url)){if(replaceRoute)location.replace(href);else location.assign(href);return;}
 const auth=url.searchParams.get('auth')??new URL(location.href).searchParams.get('auth')??history.state?.fixtureAuth;
 const state={...history.state,fixtureAuth:auth};
 if(replaceRoute)history.replaceState(state,'',url);else history.pushState(state,'',url);
}
const router={push:(href:string)=>navigate(href),replace:(href:string)=>navigate(href,true),refresh:()=>location.reload(),prefetch:()=>{}};
export const useRouter=()=>router;
export const usePathname=()=>useSyncExternalStore(subscribeRoute,()=>location.pathname,()=>'');
export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribeRoute,()=>location.search,()=>''));
export function handleFanLink(event:MouseEvent){
 if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
 const anchor=event.target instanceof Element?event.target.closest('a'):null;
 if(!anchor||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self')||!anchor.href)return;
 const url=new URL(anchor.href);
 if(!isClientFanRoute(new URL(location.href))||!isClientFanRoute(url))return;
 if(url.pathname===location.pathname&&url.search===location.search&&url.hash)return;
 event.preventDefault();navigate(url.href);
}
document.addEventListener('click',handleFanLink);
