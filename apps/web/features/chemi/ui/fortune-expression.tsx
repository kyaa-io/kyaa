"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./fortune-expression.module.css";

export const expressionFor = {
  arrival: "neutral",
  goodResult: "smile",
  choicePraise: "smile",
  unexpectedResult: "surprise",
  followup: "surprise",
} as const;

type Expression = (typeof expressionFor)[keyof typeof expressionFor];
const expressions = ["smile", "surprise"] as const;

function ExpressionLayer({ src, variant, active }: {
  src: string;
  variant: (typeof expressions)[number];
  active: boolean;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const element = image.current;
    if (!element) return;
    let current = true;
    const decode = () => {
      void element.decode().then(
        () => { if (current) setReady(true); },
        () => { /* The base art remains visible if decoding fails. */ },
      );
    };
    element.addEventListener("load", decode);
    if (element.complete && element.naturalWidth > 0) decode();
    return () => {
      current = false;
      element.removeEventListener("load", decode);
    };
  }, [active]);
  return (
    <img
      ref={image}
      src={src}
      alt=""
      aria-hidden="true"
      className={styles.layer}
      data-expression={variant}
      data-active={active && ready ? "" : undefined}
    />
  );
}

export function FortuneExpression({ character, expression }: { character: string; expression: Expression }) {
  return expressions.map((variant) => {
    const src = `/chemi/fortune/fortune-${character}-${variant}-v2.webp`;
    return <ExpressionLayer key={src} src={src} variant={variant} active={variant === expression} />;
  });
}
