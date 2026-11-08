import {createRoot} from 'react-dom/client';
import {GroupBenefitsScreen} from '@/features/groups/ui/group-benefits-screen';
import {GroupsReleaseProvider} from '@/features/groups/ui/groups-release';
import {LocaleProvider} from '@/components/locale-provider';
import {parseAppLocale} from '@/i18n/locales';
import '@/app/globals.css';
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css';
// Real API answers from the local app (vite proxies /api to it) except the cases a query names:
// ?raffles=empty → the favorite has no lucky draw; ?states=closed,open → only those real lucky draws; ?nofav=1 → no favorite named; ?zero=1 → wallet 0P·0장 (the favorite's stamps and hearts come from the real summary).
const q=new URLSearchParams(location.search),locale=parseAppLocale(q.get('locale'));
const realFetch=window.fetch.bind(window);
window.fetch=async(input,init)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.origin);
 if(q.get('raffles')==='empty'&&/^\/api\/celebrities\/[^/]+\/raffles$/.test(url.pathname))return Response.json({raffles:[]});
 if(q.get('states')&&/^\/api\/celebrities\/[^/]+\/raffles$/.test(url.pathname)){const keep=q.get('states')!.split(','),body=await (await realFetch(input,init)).json();return Response.json({raffles:body.raffles.filter((r:{status:string})=>keep.includes(r.status))});}
 if(q.get('zero')==='1'&&url.pathname==='/api/me/wallet'){const body=await (await realFetch(input,init)).json();return Response.json({...body,points:0,tickets:0});}
 if(q.get('nofav')==='1'&&url.pathname==='/api/me/summary'){const body=await (await realFetch(input,init)).json();return Response.json({...body,summary:{...body.summary,favorite:null}});}
 return realFetch(input,init);
};
createRoot(document.getElementById('root')!).render(<LocaleProvider initialLocale={locale}><GroupsReleaseProvider enabled><GroupBenefitsScreen locale={locale} signedOut={q.get('auth')==='off'}/></GroupsReleaseProvider></LocaleProvider>);
