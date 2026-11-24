"use client";

import { useEffect, useRef, useState } from "react";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { FanIconButton } from "@/components/fan-ui/fan-icon-button";
import { Volume2, VolumeX } from "@/components/fan-ui/fan-icons";

const preference = "chemi.scene.sound";
const labels: Record<string, string> = {
  ko: "장면 소리", en: "Scene sound", ja: "シーンの音", th: "เสียงฉาก",
  vi: "Âm thanh cảnh", id: "Suara adegan", "zh-Hans": "场景声音", "zh-Hant": "場景聲音",
  fr: "Son de la scène", es: "Sonido de la escena", pt: "Som da cena", ru: "Звук сцены",
};

export function SceneSound({ locale, reveal, card = false }: { locale: string; reveal: boolean; card?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const player = useRef<HTMLAudioElement>(null);
  const previous = useRef(false);
  useEffect(() => {
    try { setEnabled(localStorage.getItem(preference) === "on"); } catch { /* Session only. */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (reveal && !previous.current && enabled && player.current) {
      player.current.currentTime = 0;
      void player.current.play().catch(() => {});
    }
    previous.current = reveal;
  }, [enabled, reveal]);
  function toggle() {
    const next = !enabled;
    if (!next) player.current?.pause();
    setEnabled(next);
    try { localStorage.setItem(preference, next ? "on" : "off"); } catch { /* Session only. */ }
  }
  return <>
    <FanIconButton disabled={!ready} aria-label={labels[locale] ?? labels.en} aria-pressed={enabled} onClick={toggle}>
      <FanIcon icon={enabled ? Volume2 : VolumeX} />
    </FanIconButton>
    <audio ref={player} src={card ? "/chemi/audio/card.mp3" : "/chemi/audio/reveal.mp3"} preload={enabled ? "auto" : "none"} />
  </>;
}
