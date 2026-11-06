"use client";
import { useEffect } from "react";
import { useOptionalGroupPage } from "./group-page-context";

/** `페이지 정보` 탭은 없어졌다. 옛 주소 `?tab=info`로 들어오면 스크롤을 건드리지 않고 홈 탭 주소로 바꾼다. */
export function useRetiredInfoTab() {
  const page = useOptionalGroupPage();
  const target: string | null = page?.activeTab === "info" ? String(page.hrefFor("home")) : null;
  useEffect(() => { if (target) window.history.replaceState(null, "", target); }, [target]);
}
