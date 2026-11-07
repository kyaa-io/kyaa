"use client";

import type { PhotoSet } from "@/features/media/domain/public-image";
import { CreatorAvatar } from "./creator-avatar";

/**
 * 글 목록 행에 사진이 없을 때 쓰는 페이지 이미지. 팬페이지는 승인된 아바타 크롭을 쓰고,
 * 그 밖의 페이지는 저장된 이미지 주소를 둥글게 보여 준다. 이미지가 없으면 null이라 행은 글 아이콘을 둔다.
 */
export function fanPostPageImage(page: Readonly<{ slug?: string | null; src?: string | null; photos?: PhotoSet; position?: string }> | null | undefined) {
  if (!page?.src) return undefined;
  return <CreatorAvatar slug={page.slug ?? "page"} src={page.src} photos={page.photos} position={page.position} size={32} />;
}
