"use client";
import { useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * 주소의 쿼리 값 하나를 화면 상태로 쓴다. 값의 주인은 주소다. 링크가 주소를 바꾸면 그대로 따르고,
 * 화면이 값을 바꿀 때는 `replaceState`로 주소를 바꾸며 다시 읽기 전에도 바로 새 값을 돌려준다.
 */
export function useAddressParam(name: string) {
  const value = useSearchParams()?.get(name) ?? null;
  const [pending, setPending] = useState<{ from: string | null; to: string | null }>();
  if (pending && pending.from !== value) setPending(undefined);
  const current = pending && pending.from === value ? pending.to : value;
  const set = useCallback((next: string | null, clear: readonly string[] = []) => {
    const url = new URL(window.location.href);
    if (next === null) url.searchParams.delete(name);
    else url.searchParams.set(name, next);
    for (const key of clear) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
    setPending({ from: value, to: next });
  }, [name, value]);
  return [current, set] as const;
}
