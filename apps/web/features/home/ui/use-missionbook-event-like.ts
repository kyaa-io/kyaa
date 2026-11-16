"use client";

import { z } from "zod";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { followEventSlug } from "@/app/follow/follow-event";
import { displayedMissionbookLikes } from "../domain/missionbook-likes";

const countSchema = z.object({ likeCount: z.number().int().nonnegative() });
const parseCount = (value: unknown) => countSchema.parse(value);
const COUNT_URL = `/api/celebrities/${followEventSlug}/fans`;

/**
 * 덕질미션북 좋아요 수 = X 오픈 이벤트(/follow) 참여 수(followEventSlug 크리에이터 좋아요) + 10. 로그인과 관계없이 익명으로 읽는다.
 * /follow 에서 좋아요를 누르면 같은 화면의 이 수도 다시 읽는다(useLikeMission 이 알린다).
 */
export function useMissionbookEventLikeCount() {
  const count = useCommunityResource(COUNT_URL, parseCount, true, false, true);
  return count.state.status === "ready" ? displayedMissionbookLikes(count.state.data.likeCount) : null;
}
