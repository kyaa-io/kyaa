import type {AppLocale} from '@/i18n/locales';
const state=new URLSearchParams(location.search).get('state')??'empty';
export const useGroupRequest=()=>({ready:true,authenticated:true,ownerKey:'fixture',request:async()=>({})});
export const useGroupResource=()=>({loading:state==='loading',error:false,data:state==='loading'?null:{items:state==='joined'?[{id:'10000000-0000-4000-8000-000000000001',kind:'fan',slug:'ifewknow',name:'이퓨',imageUrl:'/images/celebrities/ifewknow/hero-studio.jpg',memberCount:1}]:[]},retry:()=>{}});
export const useSelectedBias=(_locale:AppLocale)=>({status:state==='loading'?'loading':state==='guest'?'guest':state==='error'?'error':'empty',selected:null,unverified:null,options:[],retry:()=>{},select:()=>{}});
export class GroupRequestError extends Error {constructor(readonly status:number,readonly code:string){super(code);}}
export const GROUP_WALLET_CHANGED_EVENT='kyaa:group-wallet-changed';
