import type { ReactNode } from "react";
import styles from "./media-fill.module.css";

/** Frame class for a box whose picture or video is shown whole (`object-fit: contain`). Add it to the existing frame and put a `MediaBackdrop` first inside. */
export const mediaFillClass = styles.fill!;

/** The frame's own picture, covered and blurred behind the whole picture. Decorative: it is hidden from assistive technology and never takes focus. */
export function MediaBackdrop({ src }: Readonly<{ src: string | null | undefined }>) {
  return src ? <img className={styles.backdrop} src={src} alt="" aria-hidden="true" loading="lazy" decoding="async" referrerPolicy="no-referrer" data-media-backdrop="" /> : null;
}

/** A frame with its backdrop. Size it from the call site (width, aspect-ratio); the picture or video goes in `children`. */
export function MediaFill({ src, className, children }: Readonly<{ src: string | null | undefined; className?: string; children: ReactNode }>) {
  return <span className={[styles.fill, className].filter(Boolean).join(" ")} data-media-fill="">
    <MediaBackdrop src={src} />
    {children}
  </span>;
}
