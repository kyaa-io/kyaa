import type { ReactNode } from "react";
import styles from "./fan-login-scene.module.css";

export type FanLoginSceneItem = { src: string; srcSet?: string };

/** 비로그인 개인 구역의 로그인 유도: 이 구역에 쌓이는 3D 그림 여러 개가 가볍게 떠 있고, 제목 한 줄과 로그인 버튼만 둔다.
 *  `cover`가 있으면 그 그림(여권)이 가운데에 서고 `items`가 그 옆에 떠 있다. 움직임은 transform만 쓰고 reduced-motion이면 멈춘다. */
export function FanLoginScene({ items, cover, title, action, className }: Readonly<{ items: readonly FanLoginSceneItem[]; cover?: { src: string; width: number; height: number }; title?: string; action: ReactNode; className?: string }>) {
  return <div className={[styles.scene, className].filter(Boolean).join(" ")} data-login-scene={cover ? "cover" : "row"}>
    <div className={styles.stage} aria-hidden="true">
      {cover ? <img className={styles.cover} src={cover.src} width={cover.width} height={cover.height} alt="" /> : null}
      {items.map((item, index) => <img key={item.src} className={styles.item} style={{ "--float-delay": `${index * -0.9}s` } as React.CSSProperties} src={item.src} srcSet={item.srcSet} width={96} height={96} alt="" />)}
    </div>
    {title ? <p className={styles.title}>{title}</p> : null}
    <div className={styles.action}>{action}</div>
  </div>;
}
