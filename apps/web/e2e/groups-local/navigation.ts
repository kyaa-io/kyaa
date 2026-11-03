import { useSyncExternalStore } from 'react';
export {useRouter,usePathname} from '../wave-programs-local/next-navigation';
const replace=window.history.replaceState.bind(window.history);
window.history.replaceState=(...args)=>{replace(...args);window.dispatchEvent(new Event('groups-query-change'));};
const subscribe=(listener:()=>void)=>{window.addEventListener('groups-query-change',listener);window.addEventListener('popstate',listener);return()=>{window.removeEventListener('groups-query-change',listener);window.removeEventListener('popstate',listener);};};
export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,()=>location.search,()=>''));
