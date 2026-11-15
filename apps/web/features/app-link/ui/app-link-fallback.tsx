"use client";

import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowDownToLine, ArrowLeft, ExternalLink, Share2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AppLocale } from "@/i18n/locales";
import type { AppLinkDestination } from "@/server/app-link/destination";
import type { AppLinkPresentation } from "@/server/app-link/presentation";
import styles from "./app-link-fallback.module.css";

type Copy = {
  heading: string; body: string; open: string; opening: string; web: string; install: string; unavailable: string;
  failedTitle: string; failedBody: string; retry: string; close: string; share: string; shared: string;
  invalidTitle: string; invalidBody: string; unavailableTitle: string; unavailableBody: string; expiredTitle: string; expiredBody: string; back: string;
};

const copy: Record<AppLocale, Copy> = {
  ko: { heading:"Kyaa 앱에서 이어보세요",body:"로그인하거나 팬 인증을 마쳐도\n이 활동으로 돌아와요.",open:"앱에서 이어보기",opening:"앱 여는 중…",web:"웹에서 계속",install:"앱 설치하기",unavailable:"스토어 링크를 준비 중이에요. 웹에서 계속하거나 앱 설치 후 이 링크를 다시 열어 주세요.",failedTitle:"앱이 열리지 않았나요?",failedBody:"설치한 앱을 다시 열거나 스토어에서 설치해 주세요. 설치 후 이 링크를 다시 열면 이어갈 수 있어요.",retry:"앱 다시 열기",close:"닫기",share:"링크 공유",shared:"링크를 복사했어요.",invalidTitle:"이 링크는 열 수 없어요",invalidBody:"안전을 위해 kyaa 홈에서 계속해 주세요.",unavailableTitle:"지금은 이 활동을 볼 수 없어요",unavailableBody:"비공개되었거나 삭제된 활동일 수 있어요. 공개된 상위 페이지에서 다른 활동을 확인해 주세요.",expiredTitle:"이 활동은 종료되었어요",expiredBody:"기간이 지난 활동의 상세 정보는 표시하지 않아요. 상위 페이지에서 현재 활동을 확인해 주세요.",back:"상위 페이지로 이동" },
  en: { heading:"Continue in the Kyaa app",body:"You’ll return to this activity after sign-in or fan verification.",open:"Continue in app",opening:"Opening app…",web:"Continue on the web",install:"Install the app",unavailable:"Store links are being prepared. Continue on the web, or reopen this link after installing the app.",failedTitle:"Did the app stay closed?",failedBody:"Open the installed app again, or install it from a store. After installation, reopen this link to continue.",retry:"Open app again",close:"Close",share:"Share link",shared:"Link copied.",invalidTitle:"This link can’t be opened",invalidBody:"For your security, continue from the kyaa home page.",unavailableTitle:"This activity isn’t available now",unavailableBody:"It may be private or deleted. Check the public parent page for other activities.",expiredTitle:"This activity has ended",expiredBody:"We don’t show details for expired activities. Check the parent page for current activities.",back:"Go to parent page" },
  ja: { heading:"Kyaaアプリで続きを見る",body:"ログインやファン認証の後も、このアクティビティに戻れます。",open:"アプリで続ける",opening:"アプリを開いています…",web:"ウェブで続ける",install:"アプリをインストール",unavailable:"ストアリンクを準備中です。ウェブで続けるか、アプリをインストールしてからこのリンクを再度開いてください。",failedTitle:"アプリが開きませんでしたか？",failedBody:"インストール済みのアプリをもう一度開くか、ストアからインストールしてください。インストール後にこのリンクを開くと続けられます。",retry:"アプリをもう一度開く",close:"閉じる",share:"リンクを共有",shared:"リンクをコピーしました。",invalidTitle:"このリンクは開けません",invalidBody:"安全のため、kyaaホームから続けてください。",unavailableTitle:"現在このアクティビティは表示できません",unavailableBody:"非公開または削除された可能性があります。公開中の親ページをご確認ください。",expiredTitle:"このアクティビティは終了しました",expiredBody:"期限が切れたアクティビティの詳細は表示されません。親ページで現在の情報をご確認ください。",back:"親ページへ" },
  "zh-Hans": { heading:"在 Kyaa 应用中继续",body:"登录或完成粉丝认证后，你仍会返回此活动。",open:"在应用中继续",opening:"正在打开应用…",web:"在网页中继续",install:"安装应用",unavailable:"商店链接正在准备中。请在网页中继续，或安装应用后重新打开此链接。",failedTitle:"应用没有打开？",failedBody:"请重新打开已安装的应用，或前往商店安装。安装后重新打开此链接即可继续。",retry:"再次打开应用",close:"关闭",share:"分享链接",shared:"链接已复制。",invalidTitle:"无法打开此链接",invalidBody:"为了安全，请从 kyaa 首页继续。",unavailableTitle:"目前无法查看此活动",unavailableBody:"该活动可能已设为私密或删除。请前往公开的上级页面查看其他活动。",expiredTitle:"此活动已结束",expiredBody:"过期活动的详细信息不会显示。请前往上级页面查看当前活动。",back:"前往上级页面" },
  "zh-Hant": { heading:"在 Kyaa 應用程式中繼續",body:"登入或完成粉絲認證後，你仍會返回此活動。",open:"在應用程式中繼續",opening:"正在開啟應用程式…",web:"在網頁中繼續",install:"安裝應用程式",unavailable:"商店連結準備中。請在網頁中繼續，或安裝應用程式後重新開啟此連結。",failedTitle:"應用程式沒有開啟？",failedBody:"請重新開啟已安裝的應用程式，或前往商店安裝。安裝後重新開啟此連結即可繼續。",retry:"再次開啟應用程式",close:"關閉",share:"分享連結",shared:"連結已複製。",invalidTitle:"無法開啟此連結",invalidBody:"為了安全，請從 kyaa 首頁繼續。",unavailableTitle:"目前無法查看此活動",unavailableBody:"此活動可能已設為私人或刪除。請前往公開的上層頁面查看其他活動。",expiredTitle:"此活動已結束",expiredBody:"已過期活動的詳細資訊不會顯示。請前往上層頁面查看目前活動。",back:"前往上層頁面" },
  es: { heading:"Continúa en la app de Kyaa",body:"Volverás a esta actividad después de iniciar sesión o verificarte como fan.",open:"Continuar en la app",opening:"Abriendo la app…",web:"Continuar en la web",install:"Instalar la app",unavailable:"Los enlaces de las tiendas se están preparando. Continúa en la web o vuelve a abrir este enlace después de instalar la app.",failedTitle:"¿La app no se abrió?",failedBody:"Abre de nuevo la app instalada o instálala desde una tienda. Después, vuelve a abrir este enlace para continuar.",retry:"Abrir la app de nuevo",close:"Cerrar",share:"Compartir enlace",shared:"Enlace copiado.",invalidTitle:"Este enlace no se puede abrir",invalidBody:"Por seguridad, continúa desde la página de inicio de kyaa.",unavailableTitle:"Esta actividad no está disponible",unavailableBody:"Puede ser privada o haberse eliminado. Consulta la página principal pública para ver otras actividades.",expiredTitle:"Esta actividad ha finalizado",expiredBody:"No mostramos detalles de actividades caducadas. Consulta la página principal para ver las actuales.",back:"Ir a la página principal" },
  id: { heading:"Lanjutkan di aplikasi Kyaa",body:"Anda akan kembali ke aktivitas ini setelah login atau verifikasi penggemar.",open:"Lanjutkan di aplikasi",opening:"Membuka aplikasi…",web:"Lanjutkan di web",install:"Instal aplikasi",unavailable:"Tautan toko sedang disiapkan. Lanjutkan di web atau buka kembali tautan ini setelah menginstal aplikasi.",failedTitle:"Aplikasi belum terbuka?",failedBody:"Buka lagi aplikasi yang sudah terpasang atau instal dari toko aplikasi. Setelah instalasi, buka kembali tautan ini untuk melanjutkan.",retry:"Buka aplikasi lagi",close:"Tutup",share:"Bagikan tautan",shared:"Tautan disalin.",invalidTitle:"Tautan ini tidak dapat dibuka",invalidBody:"Demi keamanan, lanjutkan dari beranda kyaa.",unavailableTitle:"Aktivitas ini belum tersedia",unavailableBody:"Aktivitas mungkin bersifat privat atau telah dihapus. Lihat halaman induk publik untuk aktivitas lain.",expiredTitle:"Aktivitas ini telah berakhir",expiredBody:"Detail aktivitas yang kedaluwarsa tidak ditampilkan. Lihat halaman induk untuk aktivitas saat ini.",back:"Ke halaman induk" },
  vi: { heading:"Tiếp tục trong ứng dụng Kyaa",body:"Bạn sẽ quay lại hoạt động này sau khi đăng nhập hoặc xác minh người hâm mộ.",open:"Tiếp tục trong ứng dụng",opening:"Đang mở ứng dụng…",web:"Tiếp tục trên web",install:"Cài đặt ứng dụng",unavailable:"Liên kết cửa hàng đang được chuẩn bị. Hãy tiếp tục trên web hoặc mở lại liên kết này sau khi cài ứng dụng.",failedTitle:"Ứng dụng chưa mở?",failedBody:"Mở lại ứng dụng đã cài hoặc cài đặt từ cửa hàng. Sau khi cài đặt, mở lại liên kết này để tiếp tục.",retry:"Mở lại ứng dụng",close:"Đóng",share:"Chia sẻ liên kết",shared:"Đã sao chép liên kết.",invalidTitle:"Không thể mở liên kết này",invalidBody:"Để bảo đảm an toàn, hãy tiếp tục từ trang chủ kyaa.",unavailableTitle:"Hiện không thể xem hoạt động này",unavailableBody:"Hoạt động có thể đã chuyển sang riêng tư hoặc bị xóa. Hãy xem trang công khai cấp trên để tìm hoạt động khác.",expiredTitle:"Hoạt động này đã kết thúc",expiredBody:"Chi tiết hoạt động đã hết hạn không được hiển thị. Hãy xem trang cấp trên để biết hoạt động hiện tại.",back:"Đến trang cấp trên" },
  th: { heading:"ดูต่อในแอป Kyaa",body:"คุณจะกลับมายังกิจกรรมนี้หลังจากเข้าสู่ระบบหรือยืนยันแฟนคลับ",open:"ดูต่อในแอป",opening:"กำลังเปิดแอป…",web:"ดูต่อบนเว็บ",install:"ติดตั้งแอป",unavailable:"กำลังเตรียมลิงก์สโตร์ โปรดดูต่อบนเว็บ หรือเปิดลิงก์นี้อีกครั้งหลังติดตั้งแอป",failedTitle:"แอปยังไม่เปิดใช่ไหม?",failedBody:"เปิดแอปที่ติดตั้งไว้อีกครั้ง หรือติดตั้งจากสโตร์ หลังติดตั้งแล้วให้เปิดลิงก์นี้อีกครั้งเพื่อดูต่อ",retry:"เปิดแอปอีกครั้ง",close:"ปิด",share:"แชร์ลิงก์",shared:"คัดลอกลิงก์แล้ว",invalidTitle:"ไม่สามารถเปิดลิงก์นี้ได้",invalidBody:"เพื่อความปลอดภัย โปรดดำเนินการต่อจากหน้าแรกของ kyaa",unavailableTitle:"ยังดูกิจกรรมนี้ไม่ได้",unavailableBody:"กิจกรรมอาจเป็นส่วนตัวหรือถูกลบแล้ว โปรดดูหน้าหลักที่เป็นสาธารณะเพื่อดูกิจกรรมอื่น",expiredTitle:"กิจกรรมนี้สิ้นสุดแล้ว",expiredBody:"เราไม่แสดงรายละเอียดของกิจกรรมที่หมดอายุ โปรดดูหน้าหลักสำหรับกิจกรรมปัจจุบัน",back:"ไปยังหน้าหลัก" },
  pt: { heading:"Continue no app Kyaa",body:"Você voltará a esta atividade depois de entrar ou concluir a verificação de fã.",open:"Continuar no app",opening:"Abrindo o app…",web:"Continuar na web",install:"Instalar o app",unavailable:"Os links das lojas estão sendo preparados. Continue na web ou abra este link novamente depois de instalar o app.",failedTitle:"O app não abriu?",failedBody:"Abra novamente o app instalado ou instale-o pela loja. Depois da instalação, reabra este link para continuar.",retry:"Abrir o app novamente",close:"Fechar",share:"Compartilhar link",shared:"Link copiado.",invalidTitle:"Este link não pode ser aberto",invalidBody:"Para sua segurança, continue pela página inicial do kyaa.",unavailableTitle:"Esta atividade não está disponível",unavailableBody:"Ela pode estar privada ou ter sido excluída. Consulte a página principal pública para ver outras atividades.",expiredTitle:"Esta atividade terminou",expiredBody:"Não exibimos detalhes de atividades expiradas. Consulte a página principal para ver as atuais.",back:"Ir para a página principal" },
  fr: { heading:"Continuer dans l’app Kyaa",body:"Vous reviendrez à cette activité après la connexion ou la vérification de fan.",open:"Continuer dans l’app",opening:"Ouverture de l’app…",web:"Continuer sur le Web",install:"Installer l’app",unavailable:"Les liens vers les boutiques sont en préparation. Continuez sur le Web ou rouvrez ce lien après avoir installé l’app.",failedTitle:"L’app ne s’est pas ouverte ?",failedBody:"Rouvrez l’app installée ou installez-la depuis une boutique. Après l’installation, rouvrez ce lien pour continuer.",retry:"Rouvrir l’app",close:"Fermer",share:"Partager le lien",shared:"Lien copié.",invalidTitle:"Ce lien ne peut pas être ouvert",invalidBody:"Pour votre sécurité, continuez depuis l’accueil kyaa.",unavailableTitle:"Cette activité n’est pas disponible",unavailableBody:"Elle est peut-être privée ou supprimée. Consultez la page parente publique pour découvrir d’autres activités.",expiredTitle:"Cette activité est terminée",expiredBody:"Les détails des activités expirées ne sont pas affichés. Consultez la page parente pour voir les activités en cours.",back:"Ouvrir la page parente" },
  ru: { heading:"Продолжить в приложении Kyaa",body:"Вы вернетесь к этому разделу после входа в систему или подтверждения статуса фаната.",open:"Продолжить в приложении",opening:"Открытие приложения…",web:"Продолжить на сайте",install:"Установите приложение",unavailable:"Ссылки на магазины приложений находятся в стадии подготовки. Продолжайте просмотр на веб-сайте или откройте эту ссылку снова после установки приложения.",failedTitle:"Приложение оставалось закрытым?",failedBody:"Откройте установленное приложение еще раз или установите его из магазина. После установки снова откройте эту ссылку, чтобы продолжить.",retry:"Откройте приложение снова.",close:"Закрыть",share:"Поделиться ссылкой",shared:"Ссылка скопирована.",invalidTitle:"Эта ссылка не может быть открыта.",invalidBody:"В целях вашей безопасности, пожалуйста, продолжите с главной страницы kyaa.",unavailableTitle:"Данная функция в данный момент недоступна.",unavailableBody:"Возможно, это приватная или удаленная страница. Проверьте общедоступную родительскую страницу для получения информации о других действиях.",expiredTitle:"Данная деятельность завершена.",expiredBody:"Мы не отображаем подробную информацию об истекших мероприятиях. Актуальную информацию о мероприятиях можно посмотреть на главной странице.",back:"Перейти на родительскую страницу" },

};

type StoreLinks = { apple: string | null; google: string | null };
type Props = { locale: AppLocale; destination: AppLinkDestination; presentation: AppLinkPresentation; stores: StoreLinks; sharePath: string };

export function AppLinkFallback({ locale, destination, presentation, stores, sharePath }: Props) {
  const t = copy[locale];
  const [state, setState] = useState<"idle" | "checking" | "failed">("idle");
  const [notice, setNotice] = useState("");
  const [platform, setPlatform] = useState<"apple" | "google" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sheet = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const agent = navigator.userAgent.toLowerCase();
    setPlatform(/iphone|ipad|ipod/.test(agent) ? "apple" : /android/.test(agent) ? "google" : null);
    const visibility = () => {
      if (document.visibilityState === "hidden" && timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        setState("idle");
      }
    };
    document.addEventListener("visibilitychange", visibility);
    return () => { if (timer.current) clearTimeout(timer.current); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  const links = useMemo(() => [
    { key: "apple" as const, label: "App Store", href: stores.apple },
    { key: "google" as const, label: "Google Play", href: stores.google },
  ].filter((item): item is { key: "apple" | "google"; label: string; href: string } => Boolean(item.href))
    .sort((a, b) => a.key === platform ? -1 : b.key === platform ? 1 : 0), [platform, stores.apple, stores.google]);

  const closeDialog = () => setState("idle");
  const attempt = (event: React.MouseEvent<HTMLElement>) => {
    if (!sheet.current?.contains(event.currentTarget)) trigger.current = event.currentTarget;
    if (timer.current) clearTimeout(timer.current);
    setState("checking");
    timer.current = setTimeout(() => { timer.current = null; if (document.visibilityState !== "hidden") setState("failed"); }, 1400);
  };

  useEffect(() => {
    if (state === "idle") { trigger.current?.focus(); return; }
    if (state !== "failed") return;
    const focusable = () => Array.from(sheet.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled])') ?? []);
    focusable()[0]?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeDialog(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0], last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [state]);

  const share = async () => {
    const shareTarget = presentation.state === "unavailable" ? presentation.parentHref : sharePath;
    const url = new URL(shareTarget, window.location.origin).toString();
    try {
      if (navigator.share) await navigator.share({ title: presentation.state === "available" ? presentation.title : "kyaa", url });
      else await navigator.clipboard.writeText(url);
      setNotice(t.shared);
    } catch { setNotice(""); }
  };

  const canOpen = destination.valid && presentation.state !== "unavailable";
  const webHref = presentation.state === "unavailable" ? presentation.parentHref : destination.webReturnTo ?? destination.returnTo;
  const webLabel = presentation.state === "unavailable" || destination.webReturnTo ? t.back : t.web;
  const unavailableTitle = presentation.state === "unavailable" && presentation.reason === "expired" ? t.expiredTitle : t.unavailableTitle;
  const unavailableBody = presentation.state === "unavailable" && presentation.reason === "expired" ? t.expiredBody : t.unavailableBody;

  return <main className={styles.page} data-fan-surface lang={locale}>
    <section className={styles.card} aria-labelledby="app-link-heading" inert={state === "failed"}>
      <header className={styles.header}>
        {canOpen && <Link className={styles.back} href={webHref as Route} aria-label={webLabel}><ArrowLeft aria-hidden="true" /></Link>}
        <span className={styles.origin}>kyaa.io</span>
        <button type="button" onClick={() => void share()} aria-label={t.share}><Share2 aria-hidden="true" /></button>
      </header>
      <div className={styles.brand}><Image src="/images/connect/kyaa-wave/logo.svg" width={1164} height={563} alt="Kyaa" priority /></div>
      {presentation.state === "available" && <>
        <div className={styles.hero}>
        {presentation.image && <Image className={styles.heroImage} src={presentation.image.src} alt={presentation.image.alt} fill sizes="(max-width: 767px) 100vw, 520px" priority />}
        </div>
        <div className={styles.heroCopy}><strong>{presentation.title}</strong><p>{presentation.subtitle}</p></div>
      </>}
      <div className={styles.copy}>
        <h1 id="app-link-heading">{!destination.valid ? t.invalidTitle : presentation.state === "unavailable" ? unavailableTitle : t.heading}</h1>
        <p>{!destination.valid ? t.invalidBody : presentation.state === "unavailable" ? unavailableBody : t.body}</p>
      </div>
      {canOpen && <details className={styles.install}>
        <summary><ArrowDownToLine aria-hidden="true" /><span><strong>{t.install}</strong><small>App Store · Google Play</small></span></summary>
        {links.length ? <div className={styles.storeLinks}>{links.map(link => <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer" data-outbound-tracking="off"><ArrowDownToLine aria-hidden="true" /><span>{link.label}</span><ExternalLink aria-hidden="true" /></a>)}</div> : <p>{t.unavailable}</p>}
      </details>}
      <div className={styles.actions}>
        {canOpen && <a className={styles.primary} href={destination.appUrl} onClick={attempt}>{state === "checking" ? t.opening : t.open}</a>}
        {!canOpen && <Link className={styles.primary} href={webHref as Route}>{webLabel}</Link>}
      </div>
      {notice && <p className={styles.srOnly} role="status">{notice}</p>}
    </section>
    {state === "failed" && <div className={styles.scrim} onMouseDown={event => { if (event.target === event.currentTarget) closeDialog(); }}>
      <section ref={sheet} className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="open-failed-title" aria-describedby="open-failed-description">
        <div className={styles.sheetHeading}><h2 id="open-failed-title">{t.failedTitle}</h2><button type="button" onClick={closeDialog} aria-label={t.close}><X aria-hidden="true" /></button></div>
        <p id="open-failed-description">{t.failedBody}</p>
        {links.length > 0 && <div className={styles.storeLinks}>{links.map(link => <a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer" data-outbound-tracking="off"><ArrowDownToLine aria-hidden="true" /><span>{link.label}</span><ExternalLink aria-hidden="true" /></a>)}</div>}
        <a className={styles.primary} href={destination.appUrl} onClick={attempt}>{t.retry}</a>
      </section>
    </div>}
  </main>;
}
