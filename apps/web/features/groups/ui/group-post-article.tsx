"use client";
import { Menu } from "@base-ui/react/menu";
import { Toggle } from "@base-ui/react/toggle";
import { Ellipsis, Heart } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { RichBody } from "@/components/editor/rich-body";
import { readRichDocument, richDocumentAttachments, type RichAttachment } from "@/components/editor/rich-document";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { fanLoginHref } from "@/components/login-href";
import { NoticeShare } from "@/components/notice/notice-share";
import contentStyles from "@/features/content-safety/ui/content.module.css";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import { PostDetailHeader } from "@/features/fan-posts/ui/post-detail-header";
import detailStyles from "@/features/fan-posts/ui/post-detail.module.css";
import type { AppLocale } from "@/i18n/locales";
import { boardCopy } from "./board-copy";
import { groupsCopy } from "./copy";
import { GroupArtistMark } from "./group-artist-mark";
import { GroupPostAsset } from "./group-post-asset";
import { GroupPostComments } from "./group-post-comments";
import { managementCopy } from "./management-copy";
import type { GroupPostAssetRef } from "./group-post-body";
import styles from "./groups.module.css";

export type GroupPostView = { id: string; title: string; body: string; bodyDoc?: unknown; nickname: string; avatarUrl: string | null; artist?: boolean; createdAt: string; visibility: string; category?: "notice" | "free"; viewCount?: number; likeCount?: number; commentCount?: number; liked?: boolean; canEdit?: boolean; canDelete?: boolean; assets?: GroupPostAssetRef[] };

export function GroupPostArticle({ pageId, post, locale, member, authenticated, busy, onLike, onEdit, onDelete, onReport, onJoin, joinPending, joinLabel }: { pageId: string; post: GroupPostView; locale: AppLocale; member: boolean; authenticated: boolean; busy: boolean; onLike: () => void; onEdit: () => void; onDelete: () => void; onReport: () => void; onJoin?: () => void; joinPending?: boolean; joinLabel?: string }) {
  const b = boardCopy(locale), m = managementCopy(locale), t = groupsCopy(locale);
  const document = useMemo(() => readRichDocument(post.bodyDoc), [post.bodyDoc]);
  const inline = useMemo(() => new Set(document ? richDocumentAttachments(document).map(item => item.assetId) : []), [document]);
  const renderAttachment = useCallback((attachment: RichAttachment) => {
    const asset = post.assets?.find(item => item.id === attachment.assetId);
    return asset ? <GroupPostAsset asset={asset} locale={locale} /> : null;
  }, [post.assets, locale]);
  const likes = post.likeCount ?? 0, returnTo = `/pages/groups/${pageId}?locale=${locale}&tab=board&post=${post.id}`;
  const likeLabel = <><Heart size={18} fill={post.liked ? "currentColor" : "none"} aria-hidden="true" />{b.like} {likes.toLocaleString(locale)}</>;
  const like = !authenticated ? <Link className={detailStyles.reaction} href={fanLoginHref(locale, returnTo)}>{likeLabel}</Link>
    : !member ? <FanAction variant="neutral" disabled={!onJoin || joinPending} onClick={onJoin} leadingIcon={<Heart />}>{b.like} {likes.toLocaleString(locale)}</FanAction>
    : <Toggle className={detailStyles.reaction} pressed={post.liked ?? false} disabled={busy} onClick={onLike}>{likeLabel}</Toggle>;
  const menu = (post.canEdit || post.canDelete || authenticated) ? <Menu.Root>
    <Menu.Trigger className={contentStyles.moreTrigger} aria-label={t.more}><Ellipsis size={20} aria-hidden="true" /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner className={contentStyles.menuPositioner} sideOffset={4} align="end"><Menu.Popup className={contentStyles.menuPopup}>
      {post.canEdit && <Menu.Item className={contentStyles.menuItem} onClick={onEdit}>{b.edit}</Menu.Item>}
      {authenticated && <Menu.Item className={contentStyles.menuItem} onClick={onReport}>{b.report}</Menu.Item>}
      {post.canDelete && <Menu.Item className={`${contentStyles.menuItem} ${contentStyles.menuItemDanger}`} disabled={busy} onClick={onDelete}>{m.remove}</Menu.Item>}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root> : undefined;
  return <article className={`${styles.boardDetail} ${detailStyles.readColumn}`}>
    <PostDetailHeader as="h2" tag={post.category === "notice" ? <FanTag tone="notice">{fanUiText(locale, "noticeTag")}</FanTag> : undefined} title={post.title} author={post.nickname} avatarUrl={post.avatarUrl} authorBadge={post.artist ? <GroupArtistMark locale={locale} /> : undefined} createdAt={post.createdAt} viewCount={post.viewCount} likeCount={likes} commentCount={post.commentCount ?? 0} locale={locale} menu={menu} />
    <div style={{ paddingTop: 16 }} data-post-body="">
      {document ? <RichBody document={document} locale={locale} renderAttachment={renderAttachment} /> : <p className={styles.boardDetailBody} style={{ padding: 0 }}>{post.body}</p>}
    </div>
    {post.assets?.filter(asset => !inline.has(asset.id)).map(asset => <GroupPostAsset key={asset.id} asset={asset} locale={locale} />)}
    <div className={detailStyles.bodyEnd}>{member && !post.liked ? <EarnBadgeCorner action="reaction" locale={locale}>{like}</EarnBadgeCorner> : like}<NoticeShare title={post.title} locale={locale} /></div>
    <GroupPostComments key={post.id} pageId={pageId} postId={post.id} locale={locale} commentCount={post.commentCount} canWrite={member} onJoin={onJoin} joinPending={joinPending} joinLabel={joinLabel} />
  </article>;
}
