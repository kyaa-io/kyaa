"use client";
import { useCallback } from "react";
import { dropResource, peekResource, shareResourceRead } from "@/components/fan-ui/resource-cache";
import { useAppLocale } from "@/components/locale-provider";
import { useGroupRequest } from "./use-group-resource";

/** 누르기 직전에 그 탭의 첫 호출을 저장소에 미리 넣는다. 실패는 무시한다(실제로 열 때 다시 읽는다). */
export function usePreloadGroupResource() {
  const { request, ready, ownerKey } = useGroupRequest();
  const { locale } = useAppLocale();
  return useCallback((url: string) => {
    if (!ready) return;
    const cacheKey = `${ownerKey}:${locale}:true:${url}`;
    if (peekResource(cacheKey)) return;
    void shareResourceRead(cacheKey, (signal) => request(url, { signal }, "json", true)).catch(() => dropResource(cacheKey));
  }, [locale, ownerKey, ready, request]);
}
