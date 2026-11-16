"use client";

import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { X } from "lucide-react";

import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { containRegion, pointOnImage, rectFromPoints, rectInBox, type Box, type MaskRect } from "./proof-image";
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
  const image = useRef<HTMLImageElement>(null);
  const [layout, setLayout] = useState<{ box: Box; natural: Box } | null>(null);
  // The picture is drawn with object-fit: contain, so a tall receipt leaves empty bands in the frame. Masks are stored
  // against the picture itself, which is what maskAndEncode paints on the saved file.
  const measure = useCallback(() => {
    const el = frame.current, img = image.current;
    if (!el || !img || !img.naturalWidth) return;
    const box = el.getBoundingClientRect();
    setLayout((prev) => (prev && prev.box.w === box.width && prev.box.h === box.height && prev.natural.w === img.naturalWidth && prev.natural.h === img.naturalHeight
      ? prev : { box: { w: box.width, h: box.height }, natural: { w: img.naturalWidth, h: img.naturalHeight } }));
  }, []);
  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === "undefined" || !frame.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, [measure, src]);
  const region = layout ? containRegion(layout.box, layout.natural) : null;
  const point = (event: PointerEvent) => {
    const box = frame.current!.getBoundingClientRect();
    const at = region ?? { x: 0, y: 0, w: box.width, h: box.height };
    return pointOnImage(event.clientX - box.left, event.clientY - box.top, at);
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
        <img ref={image} src={src} alt="" className={styles.maskImage} draggable={false} onLoad={measure} />
        {shown.map((rect, index) => {
          const at = layout && region ? rectInBox(rect, region, layout.box) : rect;
          return <span key={index} className={styles.maskRect} style={{ "--mask-x": at.x, "--mask-y": at.y, "--mask-w": at.w, "--mask-h": at.h } as CSSProperties} />;
        })}
      </div>
      <div className={styles.imageActions}>
        <FanAction variant="text" disabled={!masks.length} onClick={() => onChange(masks.slice(0, -1))}>{proofsText(locale, "pfMaskUndo")}</FanAction>
        <FanAction variant="text" onClick={onRemove} aria-label={proofsText(locale, "pfRemoveImage")}><X size={18} aria-hidden /></FanAction>
      </div>
    </div>
  );
}
