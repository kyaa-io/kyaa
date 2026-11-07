import type { ComponentProps } from "react";
import styles from "./fan-icon-button.module.css";

export type FanIconButtonProps = Omit<ComponentProps<"button">, "aria-label"> & { "aria-label": string };

/** 아이콘만 있는 44px 버튼. 받은 속성(ref·aria·이벤트)을 그대로 DOM 버튼에 넘기므로 `FanMenu`·`FanTooltip`의 트리거로 쓴다. 이름(aria-label)은 필수. */
export function FanIconButton({ className, type = "button", children, ...props }: FanIconButtonProps) {
  return <button type={type} className={[styles.button, className ?? ""].filter(Boolean).join(" ")} data-fan-icon-button="" {...props}>{children}</button>;
}
