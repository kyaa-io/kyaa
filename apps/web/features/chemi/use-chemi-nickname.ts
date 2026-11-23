"use client";
import { useEffect, useState } from "react";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";

/** 대사에서 부르는 이름: kyaa 닉네임 그대로, 8자가 넘으면 앞 7자 + '…'(기획 04-2 · 03, 05-2 · 03). 빈 이름은 null. */
export function chemiCallName(nickname: string) {
  const letters = Array.from(nickname.trim());
  if (!letters.length) return null;
  return letters.length > 8 ? `${letters.slice(0, 7).join("")}…` : letters.join("");
}

/**
 * 로그인한 팬의 별명(MY 프로필). 최애가 첫 대사에서 이 이름으로 부른다(K-4f2dc9 '내 별명 부르기').
 * 로그인 전·별명 없음·불러오기 실패면 null — 그때는 이름 없이 말한다. 운세·별자리 흐름이 같이 쓴다.
 */
export function useChemiNickname() {
  const { ready, authenticated, getAccessToken } = useByUsAuth();
  const [nickname, setNickname] = useState<string | null>(null);
  useEffect(() => {
    if (!ready || !authenticated) {
      setNickname(null);
      return;
    }
    const controller = new AbortController();
    void (async () => {
      const response = await fetch("/api/me/profile", {
        headers: { Authorization: `Bearer ${await getAccessToken()}` },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) return;
      const body = (await response.json().catch(() => null)) as { profile?: { nickname?: unknown } } | null;
      const name = body?.profile?.nickname;
      if (!controller.signal.aborted) setNickname(typeof name === "string" ? chemiCallName(name) : null);
    })().catch(() => {});
    return () => controller.abort();
  }, [ready, authenticated, getAccessToken]);
  return nickname;
}
