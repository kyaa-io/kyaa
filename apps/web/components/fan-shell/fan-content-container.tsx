import { createElement, type HTMLAttributes, type ReactNode } from "react";

import styles from "./fan-content-container.module.css";

type FanContentElement = "div" | "main" | "section";

export type FanContentBand = "read" | "list" | "full";

export type FanContentContainerProps = HTMLAttributes<HTMLElement> & {
  as?: FanContentElement;
  /** 안쪽 폭 띠: read 720 · list 920 · full 1440(기본, 셸 폭). 가운데 정렬. */
  band?: FanContentBand;
  children: ReactNode;
};

export function FanContentContainer({
  as = "div",
  band = "full",
  children,
  className,
  ...props
}: FanContentContainerProps) {
  return createElement(
    as,
    {
      ...props,
      className: [styles.container, className].filter(Boolean).join(" "),
      "data-fan-content-container": "",
      ...(band === "full" ? {} : { "data-band": band }),
    },
    children,
  );
}
