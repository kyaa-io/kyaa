import {rewardedExchangeDecision} from '../rewarded-config';
// GPT web inventory only. An earned event is not server verification of an exchange.
export type RewardedAdState = 'loading' | 'ready' | 'showing' | 'earned' | 'closed' | 'cancelled' | 'no-fill' | 'unsupported' | 'error';
type Slot = { addService(service: PubAds): Slot };
type AdEvent = { slot: Slot; isEmpty?: boolean; makeRewardedVisible?: () => boolean };
type PubAds = { addEventListener(name: string, listener: (event: AdEvent) => void): void; removeEventListener(name: string, listener: (event: AdEvent) => void): void; updateCorrelator?(): unknown };
export type RewardedGpt = {
 cmd: { push(callback: () => void): unknown };
 enums: { OutOfPageFormat: { REWARDED: unknown } };
 defineOutOfPageSlot(path: string, format: unknown): Slot | null;
 pubads(): PubAds; enableServices(): void; display(slot: Slot): void; destroySlots(slots: Slot[]): boolean;
};
const SCRIPT = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';
/** Script load and slot fill each give up after this; a request that is still loading then ends as 'error'. */
export const REWARDED_TIMEOUT_MS = 10000;
const REWARDED_HASH = '#goog_rewarded';
type PageAttrs = { style: string | null; cls: string | null };
const readAttrs = (el: Element): PageAttrs => ({ style: el.getAttribute('style'), cls: el.getAttribute('class') });
const sameAttrs = (a: PageAttrs, b: PageAttrs) => a.style === b.style && a.cls === b.cls;
function writeAttrs(el: Element, attrs: PageAttrs) {
 for (const [name, value] of [['style', attrs.style], ['class', attrs.cls]] as const) {
  if (value === null) el.removeAttribute(name); else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
 }
}
/**
 * GPT's rewarded overlay locks <body> (overflow/position/top) and adds a #goog_rewarded history entry while it is on screen.
 * dev 2026-11-08 (H7): that hash entry fired a popstate with a null state, the fan Dialog read it as Back and closed, its
 * unmount destroyed the slot, and GPT then restored its saved lock over the Dialog's own restore — body stayed
 * position:fixed without width (left-shifted, 1206px of 1440) and the hash stayed in the address.
 * This guard keeps that popstate away from the page, and on every ending puts html/body back and drops the hash.
 */
function guardRewardedPage() {
 if (typeof document === 'undefined' || typeof window === 'undefined') return { shown() {}, release(destroy: () => void) { destroy(); } };
 const els = [document.documentElement, document.body].filter((el): el is HTMLElement => Boolean(el));
 const before = els.map(readAttrs), beforeScroll = { x: window.scrollX, y: window.scrollY }, state: unknown = window.history?.state;
 let shown: PageAttrs[] | undefined;
 const onPopState = (event: PopStateEvent) => {
  if (window.location.hash !== REWARDED_HASH) return;
  // Window capture listeners run before the page's own popstate listeners (overlay Back handling, router).
  event.stopImmediatePropagation();
  try { window.history.replaceState(state, '', window.location.href); } catch { /* history unavailable */ }
 };
 window.addEventListener('popstate', onPopState, true);
 return {
  /** Call right after the overlay was made visible: the page attributes GPT just set. */
  shown() { shown = els.map(readAttrs); },
  release(destroy: () => void) {
   window.removeEventListener('popstate', onPopState, true);
   // Still exactly GPT's lock: nothing else touched the page during the ad, so the pre-ad state is right. Anything else
   // (GPT already restored, or an overlay closed and restored its own lock) is the state the page wants now.
   const current = els.map(readAttrs), lockStuck = shown !== undefined && current.every((attrs, i) => sameAttrs(attrs, shown![i]!));
   const target = lockStuck ? before : current, scroll = lockStuck ? beforeScroll : { x: window.scrollX, y: window.scrollY };
   try { destroy(); } finally {
    els.forEach((el, i) => writeAttrs(el, target[i]!));
    if (window.location.hash === REWARDED_HASH) {
     try { window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search); } catch { /* history unavailable */ }
    }
    if (window.scrollX !== scroll.x || window.scrollY !== scroll.y) window.scrollTo?.(scroll.x, scroll.y);
   }
  },
 };
}
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
  const timer=setTimeout(failed,REWARDED_TIMEOUT_MS);
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
 const page=guardRewardedPage();
 let slot:Slot|null=null,service:PubAds|undefined,visible:(()=>boolean)|undefined,ended=false,earned=false,showing=false;
 let timer:ReturnType<typeof setTimeout>|undefined;
 const listeners:Array<[string,(event:AdEvent)=>void]>=[];
 const cleanup=()=>{if(timer)clearTimeout(timer);for(const [name,listener] of listeners)service?.removeEventListener(name,listener);const owned=slot;page.release(()=>{if(owned)gpt.destroySlots([owned]);});active=false;};
 const finish=(state:RewardedAdState)=>{if(ended)return;ended=true;cleanup();onState(state);};
 const listen=(name:string,handler:(event:AdEvent)=>void)=>{const listener=(event:AdEvent)=>{if(!ended&&event.slot===slot)handler(event);};listeners.push([name,listener]);service!.addEventListener(name,listener);};
 onState('loading');
 try{
  slot=gpt.defineOutOfPageSlot(adUnit,gpt.enums.OutOfPageFormat.REWARDED);
  if(!slot){finish('unsupported');return {show:()=>false,cancel:()=>{}};}
  service=gpt.pubads();service.updateCorrelator?.();slot.addService(service);
  listen('rewardedSlotReady',event=>{if(showing||visible)return;if(timer)clearTimeout(timer);visible=event.makeRewardedVisible;onState('ready');});
  listen('rewardedSlotGranted',()=>{if(!showing||earned)return;earned=true;onState('earned');});
  listen('rewardedSlotClosed',()=>finish(earned?'closed':'cancelled'));
  // An empty render while the ad is on screen or already rewarded must not end the flow; only a request that never filled is no-fill.
  listen('slotRenderEnded',event=>{if(event.isEmpty&&!showing&&!earned)finish('no-fill');});
  timer=setTimeout(()=>finish('error'),REWARDED_TIMEOUT_MS);
  gpt.enableServices();gpt.display(slot);
 }catch{finish('error');}
 return {
  show(){if(ended||showing||!visible)return false;showing=true;try{if(!visible()){finish('error');return false;}page.shown();if(!earned&&!ended)onState('showing');return true;}catch{finish('error');return false;}},
  cancel(){finish(earned?'closed':'cancelled');},
 };
}
