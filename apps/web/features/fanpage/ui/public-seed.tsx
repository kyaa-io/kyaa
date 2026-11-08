"use client";

import { createContext, useContext, type ReactNode } from "react";

/** 서버가 비로그인 독자로 미리 읽은 공개 응답(주소 → 본문). 첫 화면을 그 값으로 그려 LCP 그림이 서버 HTML에 들어가게 한다.
 * 비로그인 읽기에만 쓰고, 로그인한 사람의 읽기는 늘 다시 받는다. */
const PublicSeedContext = createContext<Readonly<Record<string, unknown>>>({});

export function PublicSeedProvider({ seeds, children }: { seeds: Readonly<Record<string, unknown>>; children: ReactNode }) {
  return <PublicSeedContext.Provider value={seeds}>{children}</PublicSeedContext.Provider>;
}

export function usePublicSeed(url: string | null): unknown {
  const seeds = useContext(PublicSeedContext);
  return url ? seeds[url] : undefined;
}
