import type { AppLocale } from "@/i18n/locales";

type Copy = { soundOn: string; soundOff: string; play: string; pause: string };

/** Button names of the post video player. "Play" matches the editor's own playVideo wording in each language. */
const copy: Record<AppLocale, Copy> = {
  ko: { soundOn: "소리 켜기", soundOff: "소리 끄기", play: "재생", pause: "일시정지" },
  en: { soundOn: "Turn sound on", soundOff: "Turn sound off", play: "Play", pause: "Pause" },
  ja: { soundOn: "音を出す", soundOff: "音を消す", play: "再生", pause: "一時停止" },
  "zh-Hans": { soundOn: "开启声音", soundOff: "关闭声音", play: "播放", pause: "暂停" },
  "zh-Hant": { soundOn: "開啟聲音", soundOff: "關閉聲音", play: "播放", pause: "暫停" },
  es: { soundOn: "Activar sonido", soundOff: "Silenciar", play: "Reproducir", pause: "Pausar" },
  id: { soundOn: "Nyalakan suara", soundOff: "Matikan suara", play: "Putar", pause: "Jeda" },
  vi: { soundOn: "Bật âm thanh", soundOff: "Tắt âm thanh", play: "Phát", pause: "Tạm dừng" },
  th: { soundOn: "เปิดเสียง", soundOff: "ปิดเสียง", play: "เล่น", pause: "หยุดชั่วคราว" },
  pt: { soundOn: "Ativar som", soundOff: "Desativar som", play: "Reproduzir", pause: "Pausar" },
  fr: { soundOn: "Activer le son", soundOff: "Couper le son", play: "Lire", pause: "Pause" },
  ru: { soundOn: "Включить звук", soundOff: "Выключить звук", play: "Воспроизвести", pause: "Пауза" },
};

export function feedVideoCopy(locale: AppLocale): Copy { return copy[locale] ?? copy.en; }
