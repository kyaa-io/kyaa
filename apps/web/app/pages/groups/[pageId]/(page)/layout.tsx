import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { z } from "zod";
import { groupsEnabled } from "@/features/groups/domain/availability";
import { GroupPageFrame } from "@/features/groups/ui/group-page-frame";

/** 머리·접속 띠·탭은 여기서 한 번만 마운트된다. 탭(`?tab=`)을 바꿔도 다시 그려지지 않는다. */
export default async function GroupPageLayout({ params, children }: { params: Promise<{ pageId: string }>; children: ReactNode }) {
  if (!groupsEnabled()) notFound();
  const { pageId } = await params;
  if (!z.string().uuid().safeParse(pageId).success) notFound();
  return <GroupPageFrame pageId={pageId}>{children}</GroupPageFrame>;
}
