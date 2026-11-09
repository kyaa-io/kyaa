"use client";
import { Menu } from "@base-ui/react/menu";
import { Ellipsis } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { editorText } from "@/components/editor/editor-copy";
import { RichBody } from "@/components/editor/rich-body";
import { readRichDocument, richDocumentAttachments, type RichAttachment } from "@/components/editor/rich-document";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { fanUiText } from "@/components/fan-ui/fan-ui-copy";
import { fanLoginHref } from "@/components/login-href";
import { PostShareAction } from "@/features/fan-posts/ui/post-share-action";
import contentStyles from "@/features/content-safety/ui/content.module.css";
import { PostDetailHeader } from "@/features/fan-posts/ui/post-detail-header";
import { applyReaction, PostReactions, type PostReactionChoice, type PostReactionState } from "@/features/fan-posts/ui/post-reactions";
import detailStyles from "@/features/fan-posts/ui/post-detail.module.css";
import type { AppLocale } from "@/i18n/locales";
import { boardCopy } from "./board-copy";
import { groupsCopy } from "./copy";
import { GroupArtistMark } from "./group-artist-mark";
import { GroupOperatorMark } from "./group-operator-mark";
import { GroupPostAsset } from "./group-post-asset";
import { GroupPostComments } from "./group-post-comments";
import { managementCopy } from "./management-copy";
import type { GroupPostAssetRef } from "./group-post-body";
import styles from "./groups.module.css";

export type GroupPostView = { id: string; title: string; body: string; bodyDoc?: unknown; bodyDocUnavailable?: boolean; nickname: string; avatarUrl: string | null; artist?: boolean; operator?: boolean; createdAt: string; visibility: string; category?: "notice" | "free"; viewCount?: number; likeCount?: number; commentCount?: number; liked?: boolean; disliked?: boolean; dislikeCount?: number | null; canEdit?: boolean; canDelete?: boolean; assets?: GroupPostAssetRef[] };

export function GroupPostArticle({ pageId, post, locale, member, authenticated, busy, onReact, onEdit, onDelete, onReport, onRefresh, onJoin, joinPending, joinLabel }: { onRefresh?: () => void; pageId: string; post: GroupPostView; locale: AppLocale; member: boolean; authenticated: boolean; busy: boolean; onReact: (choice: PostReactionChoice, current: PostReactionState["reaction"]) => Promise<boolean> | void; onEdit: () => void; onDelete: () => void; onReport: () => void; onJoin?: () => void; joinPending?: boolean; joinLabel?: string }) {
  const b = boardCopy(locale), m = managementCopy(locale), t = groupsCopy(locale), [editBlocked, setEditBlocked] = useState(false);
  // Plain text standing in for a document that failed to read would replace the document on save.
  const startEdit = () => { if (post.bodyDocUnavailable) { setEditBlocked(true); onRefresh?.(); return; } setEditBlocked(false); onEdit(); };
  const document = useMemo(() => readRichDocument(post.bodyDoc), [post.bodyDoc]);
  const inline = useMemo(() => new Set(document ? richDocumentAttachments(document).map(item => item.assetId) : []), [document]);
  const renderAttachment = useCallback((attachment: RichAttachment) => {
    const asset = post.assets?.find(item => item.id === attachment.assetId);
    return asset ? <GroupPostAsset asset={asset} locale={locale} /> : null;
  }, [post.assets, locale]);
  // 261107-2 F4: the thumbs change where they are pressed; a failed write puts the server value back.
  const server: PostReactionState = { reaction: post.liked ? "like" : post.disliked ? "dislike" : null, likeCount: post.likeCount ?? 0, dislikeCount: post.dislikeCount ?? null };
  const [optimistic, setOptimistic] = useState<PostReactionState | null>(null), reacting = useRef(false);
  // A new read of the post replaces the guess once no choice is on its way.
  useEffect(() => { if (!reacting.current) setOptimistic(null); }, [post]);
  const shownReaction = optimistic ?? server;
  const react = async (choice: PostReactionChoice) => {
    const current = shownReaction.reaction;
    setOptimistic(applyReaction(shownReaction, choice));
    reacting.current = true;
    const saved = await Promise.resolve(onReact(choice, current)).finally(() => { reacting.current = false; });
    if (saved === false) setOptimistic(null);
  };
  const likes = shownReaction.likeCount, returnTo = `/pages/groups/${pageId}?locale=${locale}&tab=board&post=${post.id}`;
  const reaction = <PostReactions reaction={shownReaction.reaction} likeCount={likes} dislikeCount={shownReaction.dislikeCount} locale={locale} busy={busy}
    loginHref={authenticated ? undefined : String(fanLoginHref(locale, returnTo))} join={authenticated && !member ? { onJoin, pending: joinPending } : undefined}
    onChange={choice => void react(choice)} likeReward={member && shownReaction.reaction !== "like"} />;
  const menu = (post.canEdit || post.canDelete || authenticated) ? <Menu.Root>
    <Menu.Trigger className={contentStyles.moreTrigger} aria-label={t.more}><Ellipsis size={20} aria-hidden="true" /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner className={contentStyles.menuPositioner} sideOffset={4} align="end"><Menu.Popup className={contentStyles.menuPopup}>
      {post.canEdit && <Menu.Item className={contentStyles.menuItem} onClick={startEdit}>{b.edit}</Menu.Item>}
      {authenticated && <Menu.Item className={contentStyles.menuItem} onClick={onReport}>{b.report}</Menu.Item>}
      {post.canDelete && <Menu.Item className={`${contentStyles.menuItem} ${contentStyles.menuItemDanger}`} disabled={busy} onClick={onDelete}>{m.remove}</Menu.Item>}
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root> : undefined;
  return <article className={`${styles.boardDetail} ${detailStyles.readColumn}`}>
    <PostDetailHeader as="h2" tag={post.category === "notice" ? <FanTag tone="notice">{fanUiText(locale, "noticeTag")}</FanTag> : undefined} title={post.title} author={post.nickname} avatarUrl={post.avatarUrl} authorBadge={post.artist ? <GroupArtistMark locale={locale} /> : post.operator ? <GroupOperatorMark locale={locale} /> : undefined} createdAt={post.createdAt} viewCount={post.viewCount} likeCount={likes} commentCount={post.commentCount ?? 0} locale={locale} menu={menu} />
    <div style={{ paddingTop: 16 }} data-post-body="">
      {document ? <RichBody document={document} locale={locale} renderAttachment={renderAttachment} /> : <p className={styles.boardDetailBody} style={{ padding: 0 }}>{post.body}</p>}
    </div>
    {post.assets?.filter(asset => !inline.has(asset.id)).map(asset => <GroupPostAsset key={asset.id} asset={asset} locale={locale} />)}
    <div className={detailStyles.bodyEnd}>{reaction}<PostShareAction title={post.title} locale={locale} /></div>
    {editBlocked && post.bodyDocUnavailable && <p role="alert" className={contentStyles.error}>{editorText(locale, "bodyDocUnavailable")}</p>}
    <GroupPostComments key={post.id} pageId={pageId} postId={post.id} locale={locale} commentCount={post.commentCount} canWrite={member} onJoin={onJoin} joinPending={joinPending} joinLabel={joinLabel} />
  </article>;
}
