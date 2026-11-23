"use client";

import { useSyncExternalStore } from "react";
import { useChemiFeatures } from "@/features/chemi/domain/features";
import { ASK_REACTIONS, ASK_TOPICS, type AskReaction, type AskTopic } from "./lines";

/**
 * 질문하기 단계는 주소에 둔다(L133): 뒤로 가기는 한 단계만 돌아가고, 새로 고쳐도 같은 단계가 열린다.
 * ask=topic(주제 고르기) · write(질문 쓰기, at=주제) · result(결과 화면에서 온 질문 쓰기, '이 결과' 칩) · answer(답, aq=질문 번호) · follow(이어 묻기, aq=질문 번호)
 * 답을 듣고 고른 반응은 av 에 둔다: 새로 고치거나 다시 열어도 그 반응과 그에 맞춘 이어 묻기 예시 순서가 남는다.
 */
export type AskLocation =
  | { step: "topic" }
  | { step: "result" }
  | { step: "write"; topic: AskTopic }
  | { step: "answer" | "follow"; thread: string; react?: AskReaction };

const EVENT = "chemi-ask-navigation";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse(search: string): AskLocation | null {
  const params = new URLSearchParams(search);
  const step = params.get("ask");
  const thread = params.get("aq") ?? "";
  const topic = params.get("at") as AskTopic;
  if (step === "topic" || step === "result") return { step };
  if (step === "write" && ASK_TOPICS.includes(topic)) return { step, topic };
  if ((step === "answer" || step === "follow") && uuid.test(thread)) {
    const react = ASK_REACTIONS.find((kind) => kind === params.get("av"));
    return react ? { step, thread, react } : { step, thread };
  }
  return null;
}

function subscribe(notify: () => void) {
  addEventListener("popstate", notify);
  addEventListener(EVENT, notify);
  return () => {
    removeEventListener("popstate", notify);
    removeEventListener(EVENT, notify);
  };
}

export function useAskLocation() {
  const search = useSyncExternalStore(subscribe, () => location.search, () => "");
  const { ask } = useChemiFeatures();
  return ask ? parse(search) : null;
}

/** 질문 단계로 간다. null 이면 질문 화면을 닫고 결과로 돌아간다. */
export function askGo(next: AskLocation | null, mode: "push" | "replace" = "push") {
  const url = new URL(location.href);
  for (const key of ["ask", "at", "aq", "av"]) url.searchParams.delete(key);
  if (next) {
    url.searchParams.set("ask", next.step);
    if (next.step === "write") url.searchParams.set("at", next.topic);
    if (next.step === "answer" || next.step === "follow") {
      url.searchParams.set("aq", next.thread);
      if (next.react) url.searchParams.set("av", next.react);
    }
  }
  const depth = (history.state?.chemiAsk as number | undefined) ?? 0;
  if (mode === "push") history.pushState({ ...history.state, chemiAsk: depth + 1 }, "", url);
  else history.replaceState(history.state, "", url);
  dispatchEvent(new Event(EVENT));
}

/**
 * 다른 화면 단계와 질문 화면을 기록 한 칸으로 함께 연다(다시 온 장면의 주 버튼 '질문하기'는 주제 고르기, 더 깊이 결과는 '이 결과' 질문 쓰기).
 * 뒤로 가면 누르기 전 화면이다. params 는 함께 바꿀 주소 값(null 이면 지움), state 는 그 화면이 기록에 두는 값이다.
 */
export function askOpenWith(params: Record<string, string | null>, state: Record<string, unknown>, step: "topic" | "result" = "topic") {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ ...params, at: null, aq: null, av: null }))
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  url.searchParams.set("ask", step);
  history.pushState({ ...state, chemiAsk: 1 }, "", url);
  dispatchEvent(new Event(EVENT));
}

/** 한 단계 뒤로. 이 화면이 쌓은 기록이 있으면 브라우저 뒤로 가기와 같은 길로 간다. */
export function askBack() {
  if (history.state?.chemiAsk) history.back();
  else askGo(null, "replace");
}
