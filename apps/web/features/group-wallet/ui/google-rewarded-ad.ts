import {rewardedExchangeDecision} from '../rewarded-config';
// GPT web inventory only. An earned event is not server verification of an exchange.
export type RewardedAdState = 'loading' | 'ready' | 'showing' | 'earned' | 'closed' | 'cancelled' | 'no-fill' | 'unsupported' | 'error';
type Slot = { addService(service: PubAds): Slot };
type AdEvent = { slot: Slot; isEmpty?: boolean; makeRewardedVisible?: () => boolean };
type PubAds = { addEventListener(name: string, listener: (event: AdEvent) => void): void; removeEventListener(name: string, listener: (event: AdEvent) => void): void };
export type RewardedGpt = {
 cmd: { push(callback: () => void): unknown };
 enums: { OutOfPageFormat: { REWARDED: unknown } };
 defineOutOfPageSlot(path: string, format: unknown): Slot | null;
 pubads(): PubAds; enableServices(): void; display(slot: Slot): void; destroySlots(slots: Slot[]): boolean;
};
const SCRIPT = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
let loadPromise: Promise<RewardedGpt> | undefined;
/** Web rewarded inventory path; unset keeps ad-gated conversion closed. */
export function rewardedAdUnit():string|undefined {
 // Runtime value: the server reads KYAA_REWARDED_AD_UNIT and the root layout hands it to the browser via a meta tag, so one image can serve dev and prod.
 // NEXT_PUBLIC_REWARDED_AD_UNIT stays only for local preview servers; AWS builds never set it.
 try {
  if(typeof document!=='undefined')return document.querySelector<HTMLMetaElement>('meta[name="kyaa-rewarded-ad-unit"]')?.content||process.env.NEXT_PUBLIC_REWARDED_AD_UNIT||undefined;
  const decision=rewardedExchangeDecision(process.env);
  return decision.enabled?decision.adUnit:process.env.NEXT_PUBLIC_REWARDED_AD_UNIT||undefined;
 } catch { return undefined; }
}
export function loadRewardedGpt(): Promise<RewardedGpt> {
 if (loadPromise) return loadPromise;
 loadPromise = new Promise((resolve,reject) => {
  const host=window as unknown as {googletag?: RewardedGpt};
  host.googletag ??= {cmd:[]} as unknown as RewardedGpt;
  let script=document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
  const owned=!script;
  script ??= document.createElement('script');
  const failed=()=>{clearTimeout(timer);script!.removeEventListener('error',failed);if(owned)script!.remove();loadPromise=undefined;reject(new Error('REWARDED_GPT_UNAVAILABLE'));};
  const timer=setTimeout(failed,15000);
  script.addEventListener('error',failed,{once:true});
  host.googletag.cmd.push(()=>{clearTimeout(timer);script!.removeEventListener('error',failed);resolve(host.googletag!);});
  if(owned){script.src=SCRIPT;script.async=true;script.crossOrigin='anonymous';document.head.append(script);}
 });
 return loadPromise;
}

let active=false;
// Call only after an explicit opt-in; show() still requires a user action when ready.
export function requestRewardedAd(gpt:RewardedGpt,adUnit:string,onState:(state:RewardedAdState)=>void){
 if(active)throw new Error('REWARDED_AD_BUSY');
 if(!/^\/\d+\/[A-Za-z0-9_./-]+$/.test(adUnit))throw new Error('REWARDED_AD_UNIT_INVALID');
 active=true;
 let slot:Slot|null=null,service:PubAds|undefined,visible:(()=>boolean)|undefined,ended=false,earned=false,showing=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const listeners:Array<[string,(event:AdEvent)=>void]>=[];
 const cleanup=()=>{if(timer)clearTimeout(timer);for(const [name,listener] of listeners)service?.removeEventListener(name,listener);if(slot)gpt.destroySlots([slot]);active=false;};
 const finish=(state:RewardedAdState)=>{if(ended)return;ended=true;cleanup();onState(state);};
 const listen=(name:string,handler:(event:AdEvent)=>void)=>{const listener=(event:AdEvent)=>{if(!ended&&event.slot===slot)handler(event);};listeners.push([name,listener]);service!.addEventListener(name,listener);};
 onState('loading');
 try{
  slot=gpt.defineOutOfPageSlot(adUnit,gpt.enums.OutOfPageFormat.REWARDED);
  if(!slot){finish('unsupported');return {show:()=>false,cancel:()=>{}};}
  service=gpt.pubads();slot.addService(service);
  listen('rewardedSlotReady',event=>{if(showing||visible)return;if(timer)clearTimeout(timer);visible=event.makeRewardedVisible;onState('ready');});
  listen('rewardedSlotGranted',()=>{if(!showing||earned)return;earned=true;onState('earned');});
  listen('rewardedSlotClosed',()=>finish(earned?'closed':'cancelled'));
  listen('slotRenderEnded',event=>{if(event.isEmpty)finish('no-fill');});
  timer=setTimeout(()=>finish('error'),15000);
  gpt.enableServices();gpt.display(slot);
 }catch{finish('error');}
 return {
  show(){if(ended||showing||!visible)return false;showing=true;try{if(!visible()){finish('error');return false;}if(!earned&&!ended)onState('showing');return true;}catch{finish('error');return false;}},
  cancel(){finish(earned?'closed':'cancelled');},
 };
}
