"use client";
import { useEffect, useRef, useState } from "react";
import type { AppLocale } from "@/i18n/locales";
import { embeddedApp, landingHandoff, requiresGoogleBrowserHandoff } from "./login-browser-policy";
import { recordProductEventV1 } from "@/features/analytics/client/product-event-client";
import { FanAction } from "./fan-ui/fan-action";
import { FanHeading } from "./fan-ui/fan-heading";
import { ArrowRight } from "./icons";
import styles from "./landing-browser-dialog.module.css";

const copy: Record<AppLocale, [string,string,string,string]> = {
  ko:["브라우저에서 열기","오른쪽 위 ··· 또는 공유 메뉴에서 브라우저로 열기를 선택해 주세요.","주소 복사","그냥 여기서 계속"],
  en:["Open in browser","Tap ··· or Share, then open in your browser.","Copy address","Continue here"],
  ja:["ブラウザで開く","··· または共有からブラウザで開いてください。","アドレスをコピー","ここで続ける"],
  "zh-Hans":["在浏览器中打开","点按 ··· 或分享，然后选择在浏览器中打开。","复制地址","在这里继续"],
  "zh-Hant":["在瀏覽器中開啟","點選 ··· 或分享，然後選擇在瀏覽器中開啟。","複製網址","在這裡繼續"],
  es:["Abrir en el navegador","Toca ··· o Compartir y abre el enlace en tu navegador.","Copiar dirección","Continuar aquí"],
  fr:["Ouvrir dans le navigateur","Touchez ··· ou Partager puis ouvrez le lien dans votre navigateur.","Copier l’adresse","Continuer ici"],
  pt:["Abrir no navegador","Toque em ··· ou Compartilhar e abra no navegador.","Copiar endereço","Continuar aqui"],
  ru:["Открыть в браузере","Нажмите ··· или «Поделиться» и откройте ссылку в браузере.","Скопировать адрес","Продолжить здесь"],
  vi:["Mở trong trình duyệt","Chạm ··· hoặc Chia sẻ rồi mở trong trình duyệt.","Sao chép địa chỉ","Tiếp tục tại đây"],
  th:["เปิดในเบราว์เซอร์","แตะ ··· หรือแชร์ แล้วเปิดในเบราว์เซอร์","คัดลอกที่อยู่","ดำเนินการต่อที่นี่"],
  id:["Buka di browser","Ketuk ··· atau Bagikan, lalu buka di browser.","Salin alamat","Lanjutkan di sini"],
};
function measure(step: string, app: string) {
  void recordProductEventV1({ eventName:"browser_handoff", source:"web.login", idempotencyKey:crypto.randomUUID(),
    celebrityId:null,liveEventId:null,missionId:null,benefitId:null,properties:{step,app} }).catch(() => {});
}

export function LandingBrowserDialog({locale}:{locale:AppLocale}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [fallback,setFallback] = useState<string|null>(null);
  const [manual,setManual] = useState("");
  const [copied,setCopied] = useState(false);
  const [title,menu,copyLabel,stay] = copy[locale];
  useEffect(() => {
    const url = new URL(location.href);
    // Only public landings and plain login entry links may move across browser sessions.
    if (!/^\/(?:[a-z0-9-]+\/?|c\/[a-z0-9-]+\/?)?$/.test(url.pathname) ||
        /^\/(?:admin|my|settings|connect|onboarding|payment|checkout|auth|claim|download)(?:\/|$)/.test(url.pathname) ||
        [...url.searchParams.keys()].some(k => !/^(utm_\w+|locale|returnTo|intent|entity|authIntent|kyaa_browser|openExternalBrowser)$/.test(k)) || url.hash) return;
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
    try {
      const previous = sessionStorage.getItem("kyaa.browser.attempt");
      if (previous === "continue" || (previous && !source)) return;
      sessionStorage.setItem("kyaa.browser.attempt","1");
    } catch { if (!source) { url.searchParams.set("kyaa_browser",embeddedApp(ua)); history.replaceState(history.state,"",url); } }
    const plan = landingHandoff(ua,url);
    dialog.current?.showModal();
    setFallback(plan.fallback);
    measure("overlay",embeddedApp(ua));
    if (plan.target && !source) {
      measure("attempt",embeddedApp(ua));
      try { location.assign(plan.target); } catch { /* Manual actions remain available. */ }
    }
  },[]);
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="browser-heading" onClose={()=>{
    try { sessionStorage.setItem("kyaa.browser.attempt","continue"); } catch { /* Storage unavailable. */ }
    measure("continue",embeddedApp(navigator.userAgent));
  }}>
    <ArrowRight className={styles.arrow} aria-hidden="true" /><FanHeading id="browser-heading">{title}</FanHeading><p>{menu}</p>
    {fallback && <a href={fallback}>{title}</a>}
    <FanAction variant="secondary" onClick={async()=>{try {await navigator.clipboard.writeText(location.href);setCopied(true);} catch {setManual(location.href);} }}>{copyLabel}{copied && <span role="status"> OK</span>}</FanAction>
    {manual && <input aria-label={copyLabel} value={manual} readOnly onFocus={e=>e.target.select()} />}
    <FanAction variant="secondary" onClick={()=>dialog.current?.close()}>{stay}</FanAction>
  </dialog>;
}
