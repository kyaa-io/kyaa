"use client";
import dynamic from "next/dynamic";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import styles from "./rich-text.module.css";

/** Entry point for screens. The editor code loads only when a write form opens. */
export const LazyRichEditor = dynamic(() => import("./rich-editor").then(module => module.RichEditor), {
  ssr: false,
  loading: () => <div className={styles.loading} aria-busy="true"><FanSkeleton height={44} /><FanSkeleton width="70%" height={16} /><FanSkeleton width="50%" height={16} /></div>,
});
