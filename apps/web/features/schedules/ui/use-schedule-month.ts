"use client";
import { throwIfAborted } from "@/features/reliability/client/throw-if-aborted";
import { useCallback, useEffect, useRef, useState } from "react";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { useByUsSession } from "@/components/byus-session-provider";
import { withRequestDeadline } from "@/features/reliability/client/request-deadline";
import { peekResource, shareResourceRead } from "@/components/fan-ui/resource-cache";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { pageSchema, scheduleSchema, type Schedule } from "../domain/participation";
const parse = pageSchema(scheduleSchema);
type State = { key: string; status: "ready"; items: Schedule[] } | { key: string; status: "error" };
export function useScheduleMonth(month: string, locale: AppLocale, celebritySlug?: string, active = true) {
  const auth = usePrivy(), session = useByUsSession();
  const [revision, setRevision] = useState(0), [snapshot, setSnapshot] = useState<State>();
  const tokenProvider = useRef(auth.getAccessToken);
  useEffect(() => { tokenProvider.current = auth.getAccessToken; }, [auth.getAccessToken]);
  const enabled = active && auth.ready && (!auth.authenticated || session.ready);
  const key = `${month}:${locale}:${celebritySlug ?? ""}:${enabled}:${auth.authenticated}:${auth.user?.id ?? ""}:${session.generation}:${revision}`;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      const token = auth.authenticated ? await tokenProvider.current() : null;
      throwIfAborted(controller.signal);
      if (auth.authenticated && !token) throw new Error("AUTHENTICATION_REQUIRED");
      // 같은 달·같은 사람을 읽는 화면(달력·일정 요약)은 진행 중이거나 막 받은 한 요청을 같이 쓴다.
      const shared = `schedules:${key}`, cached = peekResource(shared);
      const items = cached?.fresh ? cached.value as Schedule[] : await shareResourceRead(shared, async (signal) => {
      const items: Schedule[] = [], seen = new Set<string>();
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ month, locale: toContentLocale(locale) });
        if (celebritySlug) query.set("celebritySlug", celebritySlug);
        if (cursor) query.set("cursor", cursor);
        const page = await withRequestDeadline(async signal => {
          const response = await fetch(`/api/schedules?${query}`, { signal, cache: "no-store", headers: token ? { authorization: `Bearer ${token}` } : undefined });
          if (!response.ok) throw new Error("SCHEDULE_UNAVAILABLE");
          return parse.parse(await response.json());
        }, { signal });
        items.push(...page.items); cursor = page.nextCursor;
        if (cursor && seen.has(cursor)) throw new Error("INVALID_CURSOR");
        if (cursor) seen.add(cursor);
      } while (cursor);
      return items;
      }, controller.signal);
      if (!controller.signal.aborted) setSnapshot({ key, status: "ready", items });
    })().catch(() => { if (!controller.signal.aborted) setSnapshot({ key, status: "error" }); });
    return () => controller.abort();
  }, [key, month, locale, celebritySlug, enabled, auth.authenticated]);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  return { status: snapshot?.key === key ? snapshot.status : "loading" as const,
    items: snapshot?.key === key && snapshot.status === "ready" ? snapshot.items : [], retry };
}
