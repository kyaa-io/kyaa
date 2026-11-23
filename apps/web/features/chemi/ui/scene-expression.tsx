"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./scene-expression.module.css";

export type ExpressionScene = "fortune" | "saju" | "star" | "tarot";
export type Expression = "neutral" | "smile" | "surprise";

/**
 * 대화 단계마다 최애 표정을 고르는 규칙. 대사의 내용에 맞춘다(기획 13-2 표정 시점 표를 기본·웃음·놀람 세 장으로 옮김).
 * - 처음 보는 결과(운세 첫 점수·사주 첫 풀이·거꾸로 선 타로 카드를 뒤집을 때): 놀람
 * - 좋은 분야(80점 이상)·별 3개 이상·행운·둘 사이·바로 선 카드·타로 마지막 한마디: 웃음
 * - 낮은 분야·주의·올해 흐름·별 1~2개·거꾸로 선 카드 풀이: 기본(걱정 표정 대신)
 * - 질문하기: 답은 웃음, 이어 묻기는 놀람, 고른 반응은 `askReactionExpression`, 기다림·안전 안내는 기본
 */
export const expressionFor = {
  firstReveal: "surprise",
  good: "smile",
  low: "neutral",
  luck: "smile",
  bond: "smile",
  answer: "smile",
  followup: "surprise",
  wait: "neutral",
} as const satisfies Record<string, Expression>;

const art: Record<ExpressionScene, (character: string, variant: Exclude<Expression, "neutral">) => string> = {
  fortune: (character, variant) => `/chemi/fortune/fortune-${character}-${variant}-v2.webp`,
  saju: (character, variant) => `/chemi/saju/saju-${character}-${variant}-v1.webp`,
  star: (character, variant) => `/chemi/star/hero-${character}-${variant}-p-v1.webp`,
  tarot: (character, variant) => `/chemi/tarot/scene-${character}-${variant}-p-v1.webp`,
};

function ExpressionLayer({ scene, src, variant, active, wide }: {
  scene: ExpressionScene;
  src: string;
  variant: Expression;
  active: boolean;
  wide: "48" | "64";
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
        () => { /* 읽지 못하면 아래 그림이 그대로 보인다. */ },
      );
    };
    element.addEventListener("load", decode);
    if (element.complete && element.naturalWidth > 0) decode();
    return () => {
      current = false;
      element.removeEventListener("load", decode);
    };
  }, [src]);
  return (
    <img
      ref={image}
      src={src}
      alt=""
      aria-hidden="true"
      decoding="async"
      fetchPriority="low"
      className={styles.layer}
      data-expression={variant}
      data-scene={scene}
      data-wide={wide}
      data-active={active && ready ? "" : undefined}
    />
  );
}

/**
 * 장면 그림 위에 겹치는 표정 그림. 세 장을 처음부터 그려 두어(보이지 않게) 미리 내려받고, 읽기가 끝난 그림만 바꾼다.
 * `expression` 이 null 이면 대화 밖이라 아무것도 보이지 않는다.
 * 가로 원화를 쓰는 넓은 화면(`wide` rem 이상)에서는 대화 동안 세로 원화(`portrait`)를 기본 표정으로 깔아,
 * 표정이 바뀔 때 구도는 그대로 두고 얼굴만 바뀌게 한다. 좁은 화면에서는 아래 그림이 이미 그 세로 원화다.
 */
export function SceneExpression({ scene, character, portrait, expression, wide = "48" }: {
  scene: ExpressionScene;
  character: string;
  portrait: string;
  expression: Expression | null;
  wide?: "48" | "64";
}) {
  return (
    <>
      <ExpressionLayer key={portrait} scene={scene} src={portrait} variant="neutral" active={expression !== null} wide={wide} />
      {(["smile", "surprise"] as const).map((variant) => (
        <ExpressionLayer key={art[scene](character, variant)} scene={scene} src={art[scene](character, variant)} variant={variant} active={variant === expression} wide={wide} />
      ))}
    </>
  );
}
