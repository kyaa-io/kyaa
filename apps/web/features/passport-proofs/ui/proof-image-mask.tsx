"use client";

import { useRef, useState, type PointerEvent } from "react";
import { X } from "lucide-react";

import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { rectFromPoints, type MaskRect } from "./proof-image";
import { proofsText } from "./proofs-copy";
import styles from "./proofs.module.css";

type Props = {
  locale: AppLocale;
  src: string;
  masks: MaskRect[];
  onChange: (masks: MaskRect[]) => void;
  onRemove: () => void;
};

/** Drag rectangles over an image preview. The covers are burned in when the file is re-encoded for upload. */
export function ProofImageMask({ locale, src, masks, onChange, onRemove }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ start: { x: number; y: number }; now: { x: number; y: number } } | null>(null);
  const point = (event: PointerEvent) => {
    const box = frame.current!.getBoundingClientRect();
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return { x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height) };
  };
  const finish = () => {
    if (!draft) return;
    const rect = rectFromPoints(draft.start, draft.now);
    if (rect.w > 0.01 && rect.h > 0.01) onChange([...masks, rect]);
    setDraft(null);
  };
  const shown = draft ? [...masks, rectFromPoints(draft.start, draft.now)] : masks;
  return (
    <div className={styles.imageItem}>
      <div
        ref={frame}
        className={styles.maskFrame}
        data-proof-mask-frame
        role="img"
        aria-label={proofsText(locale, "pfMaskHint")}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); const start = point(event); setDraft({ start, now: start }); }}
        onPointerMove={(event) => draft && setDraft({ ...draft, now: point(event) })}
        onPointerUp={finish}
        onPointerCancel={() => setDraft(null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
        <img src={src} alt="" className={styles.maskImage} draggable={false} />
        {shown.map((rect, index) => (
          <span key={index} className={styles.maskRect} style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }} />
        ))}
      </div>
      <div className={styles.imageActions}>
        <FanAction variant="text" disabled={!masks.length} onClick={() => onChange(masks.slice(0, -1))}>{proofsText(locale, "pfMaskUndo")}</FanAction>
        <FanAction variant="text" onClick={onRemove} aria-label={proofsText(locale, "pfRemoveImage")}><X size={18} aria-hidden /></FanAction>
      </div>
    </div>
  );
}
