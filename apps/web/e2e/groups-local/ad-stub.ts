// Local fixture only: replaces the Google Publisher Tag (rewarded ad) with a synthetic stub so ad-gated
// conversion can be previewed without any Google request. Installed by main.tsx only when
// NEXT_PUBLIC_REWARDED_AD_UNIT is set for the preview server (the default 3128 preview leaves it empty).
// Modes (?adstub=): reward (default) | ready | wait | close | no-fill | error | unsupported
type Listener = (event: Record<string, unknown>) => void;
export function installAdStub(requested: string | null) {
 const mode = requested ?? 'reward';
 const host = window as unknown as { googletag?: unknown; __adStub?: { mode: string; requests: string[] } };
 host.__adStub = { mode, requests: [] };
 // The real loader reuses an existing gpt.js script element; a non-JS type is never fetched or executed.
 const marker = document.createElement('script');
 marker.type = 'text/plain'; marker.src = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js'; marker.dataset.stub = 'synthetic-rewarded-ad';
 document.head.append(marker);
 const listeners = new Map<string, Listener[]>();
 const slot = { addService() { return slot; } };
 const emit = (name: string, extra: Record<string, unknown> = {}) => (listeners.get(name) ?? []).forEach(listener => listener({ slot, ...extra }));
 let overlay: HTMLElement | null = null;
 const close = () => { overlay?.remove(); overlay = null; emit('rewardedSlotClosed'); };
 const showOverlay = () => {
  overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', '합성 광고');
  overlay.dataset.adStub = 'overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#111;color:#fff;display:grid;place-content:center;gap:16px;text-align:center;font:16px/1.5 sans-serif;padding:24px';
  overlay.innerHTML = '<strong style="font-size:20px">합성 광고 (로컬 스텁)</strong><span>실제 Google 광고 요청이 없습니다.</span><span data-ad-status>광고 재생 중…</span>';
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = '광고 닫기';
  button.style.cssText = 'min-height:44px;padding:0 20px;border-radius:12px;border:1px solid #fff;background:#fff;color:#111;font:inherit;font-weight:700';
  button.addEventListener('click', close);
  overlay.append(button); document.body.append(overlay);
  if (mode === 'reward') setTimeout(() => { overlay?.querySelector('[data-ad-status]')!.replaceChildren('보상 지급됨'); emit('rewardedSlotGranted'); }, 1200);
 };
 host.googletag = {
  cmd: { push(callback: () => void) { callback(); return 1; } },
  enums: { OutOfPageFormat: { REWARDED: 'REWARDED' } },
  defineOutOfPageSlot(path: string) { host.__adStub!.requests.push(path); return mode === 'unsupported' ? null : slot; },
  pubads: () => ({
   addEventListener(name: string, listener: Listener) { listeners.set(name, [...(listeners.get(name) ?? []), listener]); },
   removeEventListener(name: string, listener: Listener) { listeners.set(name, (listeners.get(name) ?? []).filter(item => item !== listener)); },
  }),
  enableServices() {},
  display() {
   if (mode === 'error') throw new Error('synthetic ad error');
   if (mode === 'wait') return;
   if (mode === 'no-fill') { setTimeout(() => emit('slotRenderEnded', { isEmpty: true }), 200); return; }
   setTimeout(() => emit('rewardedSlotReady', { makeRewardedVisible: () => { showOverlay(); return true; } }), 300);
  },
  destroySlots() { overlay?.remove(); overlay = null; return true; },
 };
}
