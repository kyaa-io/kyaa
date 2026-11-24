"use client";
import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "@/components/fan-ui/fan-icons";
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

type YouTubePlayer = { mute(): void; unMute(): void; isMuted(): boolean; playVideo(): void; pauseVideo(): void; getPlayerState(): number; getDuration(): number; getCurrentTime(): number; destroy(): void };
type YouTubeAPI = { Player: new (node: HTMLElement, options: { videoId: string; playerVars: Record<string, number>; events: { onReady: (event: { target: YouTubePlayer }) => void; onStateChange: (event: { target: YouTubePlayer; data: number }) => void; onAutoplayBlocked: () => void } }) => YouTubePlayer };
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
  ko: ["소리 켜기", "음소거"], get mn() { return this.en; }, en: ["Turn sound on", "Mute"], ja: ["音声をオン", "ミュート"], "zh-Hans": ["打开声音", "静音"], "zh-Hant": ["開啟聲音", "靜音"], es: ["Activar sonido", "Silenciar"], id: ["Nyalakan suara", "Bisukan"], vi: ["Bật âm thanh", "Tắt tiếng"], th: ["เปิดเสียง", "ปิดเสียง"], pt: ["Ativar som", "Silenciar"], fr: ["Activer le son", "Couper le son"], ru: ["Включить звук", "Выключить звук"],
};
/** `onEnded`: the video played to its end (YouTube state 0, TikTok onStateChange 0). */
export function ShortsPlayer({ item, locale, onEnded, immersive = false, onLike }: { item: HomeShort; locale: AppLocale; onEnded?: () => void; immersive?: boolean; onLike?: () => void }) {
  const ended = useRef(onEnded);
  ended.current = onEnded;
  const [muted, setMuted] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const iframe = useRef<HTMLIFrameElement>(null);
  const youtubeNode = useRef<HTMLIFrameElement>(null);
  const player = useRef<YouTubePlayer | null>(null);
  const progress = useRef<HTMLProgressElement>(null);
  const tap = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(tap.current), []);
  const [playing, setPlaying] = useState(false);
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
        if (event.data.type === "onPlayerReady") {
          ready.current = true;
          setLoaded(true);
          setSound(desired.current, false);
          if (immersive) iframe.current?.contentWindow?.postMessage({ type: "play", "x-tiktok-player": true }, "https://www.tiktok.com");
        }
        if (event.data.type === "onMute" && ready.current && !syncing.current && typeof event.data.value === "boolean") {
          const value = event.data.value;
          if (value !== desired.current) { desired.current = value; setMuted(value); rememberMuted(value); }
        }
        if (event.data.type === "onCurrentTime" && progress.current && event.data.value?.duration > 0) progress.current.value = event.data.value.currentTime / event.data.value.duration;
        if (event.data.type === "onStateChange") setPlaying(event.data.value === 1);
        if (event.data.type === "onStateChange" && event.data.value === 0) ended.current?.();
        if (event.data.type === "onPlayerError" && event.data.value?.errorCode === 3002) { setSound(true, false); setBlocked(true); }
      };
      const timeout = window.setTimeout(() => {
        if (!ready.current) setShowSource(true);
      }, 8000);
      window.addEventListener("message", onMessage);
      return () => {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
      };
    }
    let disposed = false;
    void youtubeAPI().then(api => {
      if (disposed || !youtubeNode.current) return;
      player.current = new api.Player(youtubeNode.current, { videoId: item.videoId, playerVars: { rel: 0, playsinline: 1, enablejsapi: 1, autoplay: Number(immersive) }, events: {
        onReady: event => { if (disposed) return; ready.current = true; setLoaded(true); player.current = event.target; setSound(desired.current, false); },
        onStateChange: event => { if (!disposed && event.data === 0) ended.current?.(); if (!disposed && ready.current && !syncing.current) { const value = event.target.isMuted(); if (value !== desired.current) { desired.current = value; setMuted(value); rememberMuted(value); } } },
        onAutoplayBlocked: () => { if (!disposed) { setSound(true, false); setBlocked(true); } },
      } });
    }).catch(() => undefined);
    const poll = window.setInterval(() => { if (!disposed && ready.current && player.current && !syncing.current) { if (progress.current && player.current.getDuration() > 0) progress.current.value = player.current.getCurrentTime() / player.current.getDuration(); const value = player.current.isMuted(); if (value !== desired.current) { desired.current = value; setMuted(value); rememberMuted(value); } } }, 600);
    return () => { disposed = true; window.clearInterval(poll); player.current?.destroy(); player.current = null; };
  }, [item.platform, item.videoId, immersive]);
  const cover = item.thumbnail ?? (item.platform === "tiktok" ? `/images/media/tiktok/${item.videoId}.jpg` : `https://i.ytimg.com/vi/${item.videoId}/oardefault.jpg`);
  return <div className={styles.mediaFrame} data-loading={immersive && item.platform !== "tiktok" && !loaded || undefined}>
    {immersive && item.platform !== "tiktok" && !loaded && <img className={styles.playerPoster} src={cover} alt="" />}
    {item.platform === "tiktok" ? <iframe ref={iframe} src={`https://www.tiktok.com/player/v1/${item.videoId}?autoplay=0${immersive ? "&controls=0&loop=1&music_info=0&description=0&rel=0" : ""}`} title={item.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <iframe ref={youtubeNode} src={`https://www.youtube.com/embed/${item.videoId}?rel=0&enablejsapi=1&autoplay=${Number(immersive)}${immersive ? `&playsinline=1&mute=1&controls=0&loop=1&playlist=${item.videoId}` : ""}`} title={item.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />}
    {immersive && (item.platform !== "tiktok" || playing) && <FanAction variant="text" type="button" className={styles.tapSurface} ariaLabel={item.title} onClick={() => {
      if (tap.current !== undefined) {
        clearTimeout(tap.current); tap.current = undefined; onLike?.(); return;
      }
      tap.current = setTimeout(() => {
        tap.current = undefined;
        if (item.platform === "tiktok") iframe.current?.contentWindow?.postMessage({ type: playing ? "pause" : "play", "x-tiktok-player": true }, "https://www.tiktok.com");
        else if (player.current?.getPlayerState() === 1) player.current.pauseVideo();
        else player.current?.playVideo();
      }, 260);
    }} />}
    {immersive && item.platform === "tiktok" && showSource && !loaded && <FanAction variant="text" className={styles.sourcePlay} external href={item.href}><FanIcon icon={Play} />TikTok ↗</FanAction>}
    {immersive && <progress className={styles.feedProgress} ref={progress} value={0} max={1} aria-label={item.title} />}
    <FanAction variant="text" type="button" className={`${styles.soundButton} ${blocked ? styles.soundBlocked : ""}`} ariaLabel={soundCopy[locale][muted ? 0 : 1]} aria-pressed={!muted} onClick={() => setSound(!desired.current)}><FanIcon icon={muted ? VolumeX : Volume2} /></FanAction>
  </div>;
}
