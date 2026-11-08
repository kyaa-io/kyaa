"use client";
import { Check, CircleAlert } from "lucide-react";
import type { CSSProperties } from "react";
import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { editorText } from "./editor-copy";
import styles from "./rich-text.module.css";

/**
 * 261107-2 D5. One row per file being attached to a post or comment: a spinner while it moves, a bar with the percent when the
 * bytes are known, "processing" while the server prepares it, a check when it is in, and the failure with retry and remove.
 */
export type UploadRow = {
  key: string;
  name: string;
  state: "uploading" | "processing" | "done" | "failed";
  /** 0..1 when known. Unknown progress shows the spinner without a percent. */
  progress?: number | null;
};

const words: Record<AppLocale, { processing: string; done: string }> = {
  ko: { processing: "준비하는 중", done: "올렸어요" },
  en: { processing: "Processing", done: "Uploaded" },
  ja: { processing: "準備中", done: "アップロードしました" },
  "zh-Hans": { processing: "处理中", done: "已上传" },
  "zh-Hant": { processing: "處理中", done: "已上傳" },
  es: { processing: "Procesando", done: "Subida" },
  id: { processing: "Memproses", done: "Terunggah" },
  vi: { processing: "Đang xử lý", done: "Đã tải lên" },
  th: { processing: "กำลังเตรียม", done: "อัปโหลดแล้ว" },
  pt: { processing: "Processando", done: "Enviado" },
  fr: { processing: "Traitement", done: "Envoyé" },
  ru: { processing: "Обработка", done: "Загружено" },
};

export const uploadPercent = (progress: number | null | undefined) =>
  progress === null || progress === undefined || !Number.isFinite(progress) ? null : Math.round(Math.min(1, Math.max(0, progress)) * 100);

export function UploadProgressList({ items, locale, onRetry, onRemove, removeDone = false }: { items: readonly UploadRow[]; locale: AppLocale; onRetry?: (key: string) => void; onRemove?: (key: string) => void; /** Finished rows that are real attachments (a comment's files) keep their remove action. */ removeDone?: boolean }) {
  if (!items.length) return null;
  const w = words[locale] ?? words.en;
  return <div className={styles.uploads}>{items.map(item => {
    const percent = item.state === "uploading" ? uploadPercent(item.progress) : null;
    const status = item.state === "failed" ? editorText(locale, "uploadFailed", [item.name]) : item.state === "done" ? w.done : item.state === "processing" ? w.processing : editorText(locale, "uploading", [item.name]);
    return <div key={item.key} className={styles.upload} data-state={item.state} role={item.state === "failed" ? "alert" : "status"}>
      <span className={styles.uploadIcon} aria-hidden="true">{item.state === "failed" ? <CircleAlert size={16} /> : item.state === "done" ? <Check size={16} /> : <span className={styles.uploadSpinner} />}</span>
      <span className={styles.uploadText}><span className={styles.uploadName}>{item.state === "failed" || item.state === "uploading" ? status : `${item.name} · ${status}`}</span>{percent !== null && <span className={styles.uploadPercent}>{percent}%</span>}</span>
      {item.state === "failed" && onRetry && <FanAction variant="text" size="sm" onClick={() => onRetry(item.key)}>{editorText(locale, "retry")}</FanAction>}
      {(item.state !== "done" || removeDone) && onRemove && <FanAction variant="text" size="sm" onClick={() => onRemove(item.key)}>{editorText(locale, "remove")}</FanAction>}
      {(item.state === "uploading" || item.state === "processing") && <span className={styles.uploadBar} data-indeterminate={percent === null || item.state === "processing" || undefined} role="progressbar" aria-label={item.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent ?? undefined}>
        <span style={{ "--upload-progress": `${percent ?? 0}%` } as CSSProperties} />
      </span>}
    </div>;
  })}</div>;
}

/** A mobile-media upload task as a row: bytes moving, then the server preparing it, then failed or done. */
export function waveUploadRow(item: { key: string; file: File; uploaded?: boolean; failed?: boolean; progress?: number; media?: { state: string } }): UploadRow {
  return { key: item.key, name: item.file.name, progress: item.progress ?? null,
    state: item.failed ? "failed" : item.media?.state === "ready" ? "done" : item.uploaded ? "processing" : "uploading" };
}
