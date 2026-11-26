"use client";
import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/i18n/locales";
import { embeddedApp, landingHandoff, requiresGoogleBrowserHandoff, type HandoffMethod } from "./login-browser-policy";
import { recordProductEventV1 } from "@/features/analytics/client/product-event-client";
import { sendGa4Event } from "@/features/analytics/client/ga4-client";
import { FanAction } from "./fan-ui/fan-action";
import { FanIconButton } from "./fan-ui/fan-icon-button";
import { FanIcon } from "./fan-ui/fan-icon";
import { X } from "./fan-ui/fan-icons";
import { FanText } from "./fan-ui/fan-text";
import styles from "./landing-browser-dialog.module.css";

// [open in browser, app-menu steps, copy address, continue here (close), open in {b}, copied]
const copy: Record<AppLocale, [string,string,string,string,string,string]> = {
  ko:["브라우저에서 열기","오른쪽 위 ··· 또는 공유 메뉴에서 브라우저로 열기를 선택해 주세요.","주소 복사","그냥 여기서 계속","{b}에서 열기","복사했어요"],
  get mn() { return this.en; },
  en:["Open in browser","Tap ··· or Share, then open in your browser.","Copy address","Continue here","Open in {b}","Copied"],
  ja:["ブラウザで開く","··· または共有からブラウザで開いてください。","アドレスをコピー","ここで続ける","{b}で開く","コピーしました"],
  "zh-Hans":["在浏览器中打开","点按 ··· 或分享，然后选择在浏览器中打开。","复制地址","在这里继续","在 {b} 中打开","已复制"],
  "zh-Hant":["在瀏覽器中開啟","點選 ··· 或分享，然後選擇在瀏覽器中開啟。","複製網址","在這裡繼續","在 {b} 中開啟","已複製"],
  es:["Abrir en el navegador","Toca ··· o Compartir y abre el enlace en tu navegador.","Copiar dirección","Continuar aquí","Abrir en {b}","Copiado"],
  fr:["Ouvrir dans le navigateur","Touchez ··· ou Partager puis ouvrez le lien dans votre navigateur.","Copier l’adresse","Continuer ici","Ouvrir dans {b}","Copié"],
  pt:["Abrir no navegador","Toque em ··· ou Compartilhar e abra no navegador.","Copiar endereço","Continuar aqui","Abrir no {b}","Copiado"],
  ru:["Открыть в браузере","Нажмите ··· или «Поделиться» и откройте ссылку в браузере.","Скопировать адрес","Продолжить здесь","Открыть в {b}","Скопировано"],
  vi:["Mở trong trình duyệt","Chạm ··· hoặc Chia sẻ rồi mở trong trình duyệt.","Sao chép địa chỉ","Tiếp tục tại đây","Mở bằng {b}","Đã sao chép"],
  th:["เปิดในเบราว์เซอร์","แตะ ··· หรือแชร์ แล้วเปิดในเบราว์เซอร์","คัดลอกที่อยู่","ดำเนินการต่อที่นี่","เปิดใน {b}","คัดลอกแล้ว"],
  id:["Buka di browser","Ketuk ··· atau Bagikan, lalu buka di browser.","Salin alamat","Lanjutkan di sini","Buka di {b}","Disalin"],
};

export function browserHandoffCopy(locale: AppLocale) {
  const [openBrowser, menu, copyAddress, stay, openIn, copied] = copy[locale];
  return { openBrowser, menu, copyAddress, stay, copied, openSafari: openIn.replace("{b}", "Safari") };
}

function measure(step: string, app: string) {
  void recordProductEventV1({ eventName:"browser_handoff", source:"web.login", idempotencyKey:crypto.randomUUID(),
    celebrityId:null,liveEventId:null,missionId:null,benefitId:null,properties:{step,app} }).catch(() => {});
}

// Public landings, the raffle and plain sign-in entry links may move to another browser; nothing private or signed.
const HANDOFF_PATH = /^\/(?:[a-z0-9-]+\/?|c\/[a-z0-9-]+\/?|s\/raffle\/?)?$/;
const PRIVATE_PATH = /^\/(?:admin|my|settings|connect|onboarding|payment|checkout|auth|claim|download)(?:\/|$)/;
// Campaign tags, ad click ids, the raffle invite and entry intent travel as they are.
const HANDOFF_QUERY = /^(utm_\w+|locale|returnTo|intent|entity|authIntent|kyaa_browser|openExternalBrowser|invite|enter|twclid|fbclid|gclid|ttclid|igshid|igsh)$/;
// The app keeps the page in front when it ignores the link; after this long without the page hiding, show the menu steps.
const HANDOFF_SETTLE_MS = 1500;

export function handoffAllowed(url: URL) {
  return HANDOFF_PATH.test(url.pathname) && !PRIVATE_PATH.test(url.pathname) && !url.hash &&
    [...url.searchParams.keys()].every(key => HANDOFF_QUERY.test(key));
}

// Called inside the tap (or on arrival for the automatic try) so the app sees the person's own action.
function handOff(target: string, app: string, method: HandoffMethod, timer: { current: number | undefined }, onStuck: () => void) {
  measure("attempt",app);
  sendGa4Event("inapp_external_open",{app,method});
  window.clearTimeout(timer.current);
  let left = false;
  const away = () => { left = true; };
  window.addEventListener("pagehide",away,{once:true});
  document.addEventListener("visibilitychange",away,{once:true});
  timer.current = window.setTimeout(() => {
    window.removeEventListener("pagehide",away);
    document.removeEventListener("visibilitychange",away);
    if (!left && document.visibilityState === "visible") onStuck();
  },HANDOFF_SETTLE_MS);
  try { location.assign(target); } catch { onStuck(); }
}

type Shown = { app: string; tap: string | null; method: HandoffMethod | null; safari: boolean; address: string; ownCopy: boolean };

/** In another app's browser: one strip above the page with the hand-off link, address copy and close. On Android it
 *  first opens the page in Chrome by itself, once per tab (kyaa_browser in the address or session storage stops a loop). */
export function LandingBrowserDialog({locale}:{locale:AppLocale}) {
  const [shown,setShown] = useState<Shown|null>(null);
  const [stuck,setStuck] = useState(false);
  const [copied,setCopied] = useState(false);
  const [manual,setManual] = useState("");
  const timer = useRef<number|undefined>(undefined);
  const text = browserHandoffCopy(locale);

  useEffect(() => {
    const url = new URL(location.href);
    if (!handoffAllowed(url)) return;
    const ua = navigator.userAgent;
    const embedded = requiresGoogleBrowserHandoff(ua, matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & {standalone?:boolean}).standalone));
    const source = url.searchParams.get("kyaa_browser");
    if (!embedded) {
      if (source && /^(instagram|threads|kakao|facebook|line|tiktok|telegram|x|webview)$/.test(source)) {
        url.searchParams.delete("kyaa_browser");
        history.replaceState(history.state,"",url);
        measure("arrival",source);
      }
      return;
    }
    let tried = Boolean(source);
    try {
      const previous = sessionStorage.getItem("kyaa.browser.attempt");
      if (previous === "continue") return;
      if (previous) tried = true;
      sessionStorage.setItem("kyaa.browser.attempt","1");
    } catch { if (!source) { url.searchParams.set("kyaa_browser",embeddedApp(ua)); history.replaceState(history.state,"",url); } }
    const app = embeddedApp(ua);
    const plan = landingHandoff(ua,url);
    const marked = new URL(url); marked.searchParams.set("kyaa_browser",app);
    // The sign-in page and the raffle have their own copy-link row (the raffle's carries ?enter=1), so the strip there
    // keeps only the hand-off link.
    const ownCopy = /^\/(?:login|s\/raffle)$/.test(url.pathname.replace(/\/$/,""));
    // Deferred so the strip renders after hydration; the automatic try below does not wait for it.
    const show = window.setTimeout(() => {
      setShown({ app, tap: plan.fallback, method: plan.method, safari: plan.browser === "safari", address: marked.href, ownCopy });
      if (!plan.fallback) setStuck(true);
    },0);
    measure("overlay",app);
    if (plan.target && plan.method && !tried) handOff(plan.target,app,plan.method,timer,() => setStuck(true));
    return () => window.clearTimeout(show);
  },[]);
  useEffect(() => () => window.clearTimeout(timer.current),[]);

  if (!shown) return null;
  const close = () => {
    try { sessionStorage.setItem("kyaa.browser.attempt","continue"); } catch { /* Storage unavailable. */ }
    measure("continue",shown.app);
    setShown(null);
  };
  const { tap, method } = shown;
  return <section className={styles.strip} aria-label={text.openBrowser} data-browser-handoff={shown.app}>
    <div className={styles.row}>
      {tap && method && <FanAction variant="primary" size="sm" onClick={() => handOff(tap,shown.app,method,timer,() => setStuck(true))}>
        {shown.safari ? text.openSafari : text.openBrowser}
      </FanAction>}
      {!shown.ownCopy && <FanAction variant="text" size="sm" className={styles.copy} onClick={async()=>{
        sendGa4Event("inapp_external_open",{app:shown.app,method:"copy"});
        try { await navigator.clipboard.writeText(shown.address); setCopied(true); } catch { setManual(shown.address); }
      }}>{copied ? text.copied : text.copyAddress}</FanAction>}
      <FanIconButton className={styles.close} aria-label={text.stay} onClick={close}><FanIcon icon={X} size={16} /></FanIconButton>
    </div>
    {stuck && <FanText role="meta" as="p" className={styles.menu}>{text.menu}</FanText>}
    {manual && <input className={styles.address} aria-label={text.copyAddress} value={manual} readOnly onFocus={e=>e.target.select()} />}
  </section>;
}
