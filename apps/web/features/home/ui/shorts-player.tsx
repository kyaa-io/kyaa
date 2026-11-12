"use client";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "@/components/fan-ui/fan-icons";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import type { HomeShort } from "@/features/home/domain/home-gallery";
import type { AppLocale } from "@/i18n/locales";
import styles from "./home-shorts.module.css";

const KEY = "kyaa:shorts-muted";
let rememberedMuted: boolean | null = null;
function readMuted() {
  if (rememberedMuted !== null) return rememberedMuted;
  try { rememberedMuted = sessionStorage.getItem(KEY) !== "false"; } catch { rememberedMuted = true; }
  return rememberedMuted;
}
function rememberMuted(value: boolean) {
  rememberedMuted = value;
  try { sessionStorage.setItem(KEY, String(value)); } catch { /* memory still works */ }
}

type YouTubePlayer = { mute(): void; unMute(): void; isMuted(): boolean; playVideo(): void; destroy(): void };
type YouTubeAPI = { Player: new (node: HTMLElement, options: { videoId: string; playerVars: Record<string, number>; events: { onReady: (event: { target: YouTubePlayer }) => void; onStateChange: (event: { target: YouTubePlayer }) => void; onAutoplayBlocked: () => void } }) => YouTubePlayer };
declare global { interface Window { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void } }
let youtubeLoader: Promise<YouTubeAPI> | null = null;
function youtubeAPI(): Promise<YouTubeAPI> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!youtubeLoader) youtubeLoader = new Promise((resolve, reject) => {
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prior?.(); if (window.YT) resolve(window.YT); };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => { youtubeLoader = null; reject(new Error("YouTube API unavailable")); };
    document.head.append(script);
  });
  return youtubeLoader;
}
const soundCopy: Record<AppLocale, [string, string]> = {
  ko: ["소리 켜기", "음소거"], en: ["Turn sound on", "Mute"], ja: ["音声をオン", "ミュート"], "zh-Hans": ["打开声音", "静音"], "zh-Hant": ["開啟聲音", "靜音"], es: ["Activar sonido", "Silenciar"], id: ["Nyalakan suara", "Bisukan"], vi: ["Bật âm thanh", "Tắt tiếng"], th: ["เปิดเสียง", "ปิดเสียง"], pt: ["Ativar som", "Silenciar"], fr: ["Activer le son", "Couper le son"], ru: ["Включить звук", "Выключить звук"],
};
export function ShortsPlayer({ item, locale }: { item: HomeShort; locale: AppLocale }) {
  const [muted, setMuted] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const youtubeNode = useRef<HTMLIFrameElement>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const ready = useRef(false);
  const desired = useRef(true);
  const syncing = useRef(false);
  const setSound = (value: boolean, persist = true) => {
    desired.current = value; setMuted(value);
    if (persist) rememberMuted(value);
    if (item.platform === "tiktok") {
      syncing.current = true;
      window.setTimeout(() => { syncing.current = false; }, 600);
      iframe.current?.contentWindow?.postMessage({ type: value ? "mute" : "unMute", "x-tiktok-player": true }, "https://www.tiktok.com");
    } else if (player.current) {
      syncing.current = true;
      if (value) player.current.mute(); else player.current.unMute();
      window.setTimeout(() => { syncing.current = false; }, 600);
    }
    if (!value) setBlocked(false);
  };
  useEffect(() => {
    const initial = readMuted(); desired.current = initial; setMuted(initial); ready.current = false; setBlocked(false);
    if (item.platform === "tiktok") {
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== "https://www.tiktok.com" || event.source !== iframe.current?.contentWindow || !event.data?.["x-tiktok-player"]) return;
        if (event.data.type === "onPlayerReady") { ready.current = true; setSound(desired.current, false); }
        if (event.data.type === "onMute" && ready.current && !syncing.current && typeof event.data.value === "boolean") {
          const value = event.data.value;
          if (value !== desired.current) { desired.current = value; setMuted(value); rememberMuted(value); }
        }
        if (event.data.type === "onPlayerError" && event.data.value?.errorCode === 3002) { setSound(true, false); setBlocked(true); }
      };
      window.addEventListener("message", onMessage);
      return () => window.removeEventListener("message", onMessage);
    }
    let disposed = false;
    void youtubeAPI().then(api => {
      if (disposed || !youtubeNode.current) return;
      player.current = new api.Player(youtubeNode.current, { videoId: item.videoId, playerVars: { rel: 0, playsinline: 1, enablejsapi: 1, autoplay: 0 }, events: {
        onReady: event => { if (disposed) return; ready.current = true; player.current = event.target; setSound(desired.current, false); },
        onStateChange: event => { if (!disposed && ready.current && !syncing.current) { const value = event.target.isMuted(); if (value !== desired.current) { desired.current = value; setMuted(value); rememberMuted(value); } } },
        onAutoplayBlocked: () => { if (!disposed) { setSound(true, false); setBlocked(true); } },
      } });
    }).catch(() => undefined);
    const poll = window.setInterval(() => { if (!disposed && ready.current && player.current && !syncing.current) { const value = player.current.isMuted(); if (value !== desired.current) { desired.current = value; setMuted(value); rememberMuted(value); } } }, 600);
    return () => { disposed = true; window.clearInterval(poll); player.current?.destroy(); player.current = null; };
  }, [item.platform, item.videoId]);
  return <div className={styles.mediaFrame}>
    {item.platform === "tiktok" ? <iframe ref={iframe} src={`https://www.tiktok.com/player/v1/${item.videoId}?autoplay=0`} title={item.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <iframe ref={youtubeNode} src={`https://www.youtube.com/embed/${item.videoId}?rel=0&enablejsapi=1&autoplay=0`} title={item.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />}
    <FanAction variant="text" type="button" className={`${styles.soundButton} ${blocked ? styles.soundBlocked : ""}`} ariaLabel={soundCopy[locale][muted ? 0 : 1]} aria-pressed={!muted} onClick={() => setSound(!desired.current)}><FanIcon icon={muted ? VolumeX : Volume2} /></FanAction>
  </div>;
}
