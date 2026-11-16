"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { notifyFanActivityUpdated } from "@/components/fan-ui/fan-activity-updates";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { reactionResultSchema } from "@/features/reaction/domain/reaction";
import { followEventSlug } from "@/app/follow/follow-event";
import { displayedMissionbookLikes } from "../domain/missionbook-likes";

const countSchema = z.object({ likeCount: z.number().int().nonnegative() });
const mineSchema = z.object({ reaction: reactionResultSchema.nullable() });
const parseCount = (value: unknown) => countSchema.parse(value);
const parseMine = (value: unknown) => mineSchema.parse(value);
const COUNT_URL = `/api/celebrities/${followEventSlug}/fans`;
const REACTION_URL = `/api/celebrities/${followEventSlug}/reactions`;

/**
 * 방금 누른 좋아요를 서버 응답을 기다리지 않고 화면에 바로 보이게 하는 바닥값. 같은 화면의 수(머리)와 버튼이 함께 읽는다.
 * 서버 수가 이미 이 값 이상이면 서버 수가 이기므로 두 번 세지 않는다.
 */
type Floor = { ownerId: string; count: number } | null;
let floor: Floor = null;
const listeners = new Set<() => void>();
const setFloor = (value: Floor) => { floor = value; listeners.forEach(listener => listener()); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };

/**
 * 덕질미션북 좋아요 = X 오픈 이벤트(/follow) 좋아요(followEventSlug 크리에이터 좋아요, 1인 1회). 화면 수는 실제 참여 수 + 10.
 * `own`이 true일 때만 로그인한 사람의 눌림 상태를 읽는다(수만 필요한 홈 배너는 끈다). `enabled`가 false면 아무것도 읽지 않는다.
 */
export function useMissionbookEventLike({ enabled = true, own = false }: { enabled?: boolean; own?: boolean } = {}) {
  const auth = useByUsAuth();
  const ownerId = auth.ready && auth.authenticated ? auth.user?.id ?? null : null;
  const count = useCommunityResource(enabled ? COUNT_URL : null, parseCount, true, false, true);
  const mine = useCommunityResource(enabled && own && ownerId ? REACTION_URL : null, parseMine);
  const floorNow = useSyncExternalStore(subscribe, () => floor, () => null);
  const [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
  const real = count.state.status === "ready" ? count.state.data.likeCount : null;
  const mineFloor = floorNow && ownerId && floorNow.ownerId === ownerId ? floorNow : null;
  const shown = real === null ? null : displayedMissionbookLikes(Math.max(real, mineFloor?.count ?? 0));
  const readLiked = ownerId ? mine.state.status === "ready" ? mine.state.data.reaction !== null : null : false;
  const liked = mineFloor ? true : readLiked;
  const { getAccessToken } = auth;

  const like = useCallback(async () => {
    if (!ownerId || pending || real === null) return false;
    setPending(true); setFailed(false);
    setFloor({ ownerId, count: real + 1 });
    try {
      const token = await getAccessToken(); if (!token) throw new Error("session");
      const response = await fetch(REACTION_URL, { method: "POST", headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error("like");
      reactionResultSchema.parse(await response.json());
      notifyFanActivityUpdated(ownerId, ["community"]);
      return true;
    } catch { setFloor(null); setFailed(true); return false; }
    finally { setPending(false); }
  }, [getAccessToken, ownerId, pending, real]);

  return { count: shown, liked, pending, failed, like };
}
