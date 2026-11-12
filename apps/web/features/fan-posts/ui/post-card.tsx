"use client";
import { ProfileAuthor } from "@/features/group-social/profile-window";
import { WAVE_FANPAGE_SLUG } from "@/features/fanpage/domain/wave-programs";
import { WavePrivateBadge } from "@/features/fanpage/ui/wave-privacy";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { editorText } from "@/components/editor/editor-copy";
import { fanLoginHref } from "@/components/login-href";
import { readRichDocument, richDocumentAttachments, type RichAttachment } from "@/components/editor/rich-document";
import { PostShareAction } from "./post-share-action";
import { GroupArtistMark } from "@/features/groups/ui/group-artist-mark";
import { PostDetailHeader } from "./post-detail-header";
import { celebrateReward } from "@/components/fan-ui/reward-celebration";
import { applyReaction, PostReactions, type PostReactionChoice, type PostReactionState } from "./post-reactions";
import { PostInlineVideo, SlotPostBody, TranslatedPlainPostBody, TranslatedRichPostBody } from "./rich-post-body";
import { TranslationControl, useAutomaticTranslation } from "@/features/content-safety/ui/use-automatic-translation";
import { postSlotTexts } from "../domain/post-title-slots";
import detailStyles from "./post-detail.module.css";
import { EditedMark } from "./edited-mark";
import { isEdited } from "../domain/edited";
import { Menu } from "@base-ui/react/menu";
import { useByUsAuth as usePrivy } from "@/features/auth/client/cognito-auth";
import { Ellipsis } from "lucide-react";
import { ReactionCount, ReactionIcon } from "@/components/fan-ui/reaction-count";
import { LinkifiedText } from "@/features/content-safety/ui/linkified-text";
import {SourceConfirmDialog,sourceDeleteResultCopy} from "@/features/groups/ui/source-confirm-dialog";
import {postSchema} from "../domain/content";
import {toContentLocale} from "@/i18n/locales";
import type { FanPost } from "../domain/content";
import { PostAttachmentViewer } from "./post-attachment-viewer";
import { PostComposer } from "./post-composer";
import { ContentActions, ContentTranslation } from "@/features/content-safety/ui/content-actions";
import { AuthenticatedMedia } from "@/features/content-safety/ui/authenticated-media";
import { waveMediaCopy } from "@/i18n/catalogs/features__fanpage__wave-media";
import { ContentAssetImage } from "@/features/content-safety/ui/content-asset";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { PassportRequiredDialog, usePassportRequired } from "@/features/content-safety/ui/passport-required-dialog";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";
import boardStyles from "./board-detail.module.css";
import styles from "@/features/content-safety/ui/content.module.css";
import { RelativeTime } from "@/components/relative-time";

export function PostCard({ post, locale, onChanged, onDeleted, detail = false, returnTo, presentation,boardMetadata,boardLikeLabel,boardLikeReward }: { post: FanPost; locale: AppLocale; onChanged: () => void; onDeleted?: () => void; detail?: boolean; returnTo?: string; presentation?: "board";boardMetadata?:ReactNode;boardLikeLabel?:string;boardLikeReward?:ReactNode }) {
  const auth = usePrivy(), copy = contentCopy(locale), mutation = useContentMutation(locale), [editing, setEditing] = useState(false),[deleting,setDeleting]=useState(false),[deleteUncertain,setDeleteUncertain]=useState(false);
  const passportRequired = usePassportRequired(mutation.failure, post.celebritySlug, locale);
  const articleRef = useRef<HTMLElement>(null);
  const initialReaction = useCallback((): PostReactionState => ({ reaction: post.reaction !== undefined ? post.reaction : post.liked ? "like" : null, likeCount: post.likeCount, dislikeCount: post.dislikeCount ?? null }), [post.reaction, post.liked, post.likeCount, post.dislikeCount]);
  const [reactionState, setReactionState] = useState(initialReaction);
  const liked = reactionState.reaction === "like", likeCount = reactionState.likeCount;
  const href = `/c/${post.celebritySlug}/community/${post.id}?locale=${locale}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}` as Route;
  // A server value read while a choice is still on its way is older than the choice; the read after it settles brings the answer.
  const reacting = useRef(false);
  useEffect(() => { if (!reacting.current) setReactionState(initialReaction()); }, [initialReaction]);
  async function remove() {if(deleteUncertain){const value=await mutation.request(`/api/posts/${post.id}?locale=${toContentLocale(locale)}`,'GET');const checked=postSchema.safeParse((value as {post?:unknown}|null)?.post);if(checked.success&&checked.data.id===post.id){setDeleteUncertain(false);onChanged();}return;}if(await mutation.request(`/api/posts/${post.id}`,'DELETE')){setDeleting(false);(onDeleted??onChanged)();}else setDeleteUncertain(true);}
  /** The feed has no document. A post is opened from its detail read, so editing keeps its formatting. */
  const [editTarget, setEditTarget] = useState<FanPost | null>(null), [editBlocked, setEditBlocked] = useState(false);
  async function startEdit() {
    setEditBlocked(false);
    if ((presentation === "board" && !post.bodyDocUnavailable) || post.celebritySlug === WAVE_FANPAGE_SLUG) { setEditing(true); return; }
    const value = await mutation.request(`/api/posts/${post.id}?locale=${toContentLocale(locale)}&format=rich`, "GET");
    const read = postSchema.safeParse((value as { post?: unknown } | null)?.post);
    if (!read.success) return;
    // Plain text standing in for a document that failed to read would replace the document on save.
    if (read.data.bodyDocUnavailable) { setEditBlocked(true); return; }
    setEditTarget(read.data);
    setEditing(true);
  }
  /** One request per choice; the server keeps one reaction per person, so a like clears a dislike and the other way round. */
  async function react(choice: PostReactionChoice) {
    const previous = reactionState;
    setReactionState(applyReaction(previous, choice));
    reacting.current = true;
    const result = await mutation.request(`/api/posts/${post.id}/like`, "PUT", { reaction: choice }).finally(() => { reacting.current = false; }) as { reward?: { points?: number; stamps?: number } } | null;
    if (!result) { setReactionState(previous); return; }
    // 261107-2 D8: the shared coin badge rises from the thumb that was pressed, with the shared toast.
    if (result.reward) celebrateReward({ locale, points: result.reward.points, stamps: result.reward.stamps, anchor: articleRef.current?.querySelector(`.${choice === "dislike" ? detailStyles.reactionDislike : detailStyles.reactionLike}`) });
    // 261107-2 F4: no onChanged here. Re-reading the whole detail (post and comments) redrew the page; the write already drops
    // only this post's reads and the fan's own values (resource-cache invalidateAfterWrite), and that re-read confirms the count.
  }
  const like = () => react(liked ? "none" : "like");
  const document = useMemo(() => readRichDocument(post.bodyDoc), [post.bodyDoc]);
  const publicFanPost = post.celebritySlug !== WAVE_FANPAGE_SLUG;
  const renderAttachment = useCallback((attachment: RichAttachment) => {
    if (attachment.kind === "video") return post.video?.id === attachment.assetId ? <PostInlineVideo video={post.video} locale={locale} publicFanPost={publicFanPost} /> : null;
    const asset = post.assets.find(item => item.id === attachment.assetId);
    return asset ? <ContentAssetImage asset={asset} locale={locale} alt={copy.photo} /> : null;
  }, [post.assets, post.video, locale, publicFanPost, copy.photo]);
  const inline = useMemo(() => new Set(document ? richDocumentAttachments(document).map(item => item.assetId) : []), [document]);
  const looseAssets = post.assets.filter(asset => !inline.has(asset.id)), looseVideo = post.video && !inline.has(post.video.id) ? post.video : null;
  // A signed-in reader of a board post translates the title and the article together: one request, one state, one original/translation switch.
  // A guest keeps the whole-text display translation of the body below, and the title stays as written.
  const boardDetail = presentation === "board" && detail, slotTranslation = boardDetail && auth.authenticated;
  const slotTexts = useMemo(() => postSlotTexts(post.body), [post.body]);
  const slotTarget = useMemo(() => ({ targetType: "fan_post" as const, targetId: post.id, sourceRevision: post.revision, slots: "title-body" as const }), [post.id, post.revision]);
  const { observeElement: observeSlots, ...slots } = useAutomaticTranslation({ texts: slotTexts, locale, target: slotTarget, enabled: slotTranslation });
  // A guest (or a post read without the slot answer) translates the whole body instead. Its switch lives with the slot one at the top of the post.
  const bodyTexts = useMemo(() => [post.body], [post.body]);
  const bodyTarget = useMemo(() => ({ targetType: "fan_post" as const, targetId: post.id, sourceRevision: post.revision }), [post.id, post.revision]);
  const { observeElement: observeBody, ...bodyTranslation } = useAutomaticTranslation({ texts: bodyTexts, locale, target: bodyTarget, enabled: boardDetail && !slotTranslation && (Boolean(document) || post.body.split("\n").slice(1).join("\n") !== "") });
  const topTranslation = slotTranslation ? slots : bodyTranslation;
  if (editing) return <PostComposer board={presentation === "board" || Boolean(editTarget?.bodyDoc)} allowMembers={post.celebritySlug !== WAVE_FANPAGE_SLUG} slug={post.celebritySlug} locale={locale} post={editTarget ?? post} onCancel={() => { setEditing(false); setEditTarget(null); }} onSaved={() => { setEditing(false); setEditTarget(null); onChanged(); }} />;
  const displayedBody = presentation === "board" && detail ? post.body.split("\n").slice(1).join("\n") : post.body;
  const menu = post.isOwner ? <Menu.Root disabled={mutation.busy}>
    <Menu.Trigger className={styles.moreTrigger} aria-label={copy.more}><Ellipsis size={20} aria-hidden="true" /></Menu.Trigger>
    <Menu.Portal><Menu.Positioner className={styles.menuPositioner} sideOffset={4} align="end"><Menu.Popup className={styles.menuPopup}>
      <Menu.Item className={styles.menuItem} onClick={() => void startEdit()}>{copy.edit}</Menu.Item>
      <Menu.Item className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={() => setDeleting(true)}>{copy.delete}</Menu.Item>
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root> : <ContentActions targetType="fan_post" targetId={post.id} locale={locale} onChanged={onChanged} />;
  const loginHref = fanLoginHref(locale, `/c/${post.celebritySlug}/community/${post.id}?locale=${locale}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  return <article ref={articleRef} className={`${styles.card} ${presentation === "board" ? boardStyles.article : ""}`} data-post-id={post.id}>
    {boardDetail ? <PostDetailHeader title={slots.showing && slots.texts[0]?.trim() ? slots.texts[0] : post.body.split("\n")[0] || copy.community} titleLang={slots.showing && slots.texts[0]?.trim() ? locale : undefined} author={<ProfileAuthor contentRef={{ kind: "fan_post", id: post.id }} nickname={post.author.nickname} avatarUrl={post.author.avatarUrl}>{post.author.nickname}</ProfileAuthor>} avatarUrl={post.author.avatarUrl} translation={<TranslationControl locale={locale} translation={topTranslation} />} authorBadge={<>{post.artist && <GroupArtistMark locale={locale} />}{post.celebritySlug === WAVE_FANPAGE_SLUG ? <WavePrivateBadge locale={locale} /> : post.visibility === "members" && <span className={styles.badge}>{copy.members}</span>}</>} createdAt={post.createdAt} edited={isEdited(post)} viewCount={post.viewCount} likeCount={likeCount} commentCount={post.commentCount} locale={locale} menu={menu} /> : <header className={`${styles.meta} ${styles.postHeader}`}>{boardMetadata??<><img src={post.author.avatarUrl} alt="" width={32} height={32} /><div className={styles.postIdentity}><strong><ProfileAuthor contentRef={{ kind: "fan_post", id: post.id }} nickname={post.author.nickname} avatarUrl={post.author.avatarUrl}>{post.author.nickname}</ProfileAuthor></strong>
      {post.celebritySlug === WAVE_FANPAGE_SLUG ? <WavePrivateBadge locale={locale} /> : <span className={styles.badge}>{post.visibility === "members" ? copy.members : copy.public}</span>}
      </div>
      {menu}
    </>} </header>}
    {slotTranslation && <SlotPostBody document={document} plainText={displayedBody} translated={slots.texts[1]} translation={slots} observeElement={observeSlots} locale={locale} renderAttachment={renderAttachment} />}
    {!slotTranslation && presentation === "board" && document && <div data-post-body><TranslatedRichPostBody document={document} translation={bodyTranslation} observeElement={observeBody} locale={locale} renderAttachment={renderAttachment} /></div>}
    {!slotTranslation && presentation === "board" && !document && displayedBody && <div data-post-body><TranslatedPlainPostBody translation={bodyTranslation} observeElement={observeBody} locale={locale}><p className={styles.body}><LinkifiedText text={displayedBody} locale={locale} /></p></TranslatedPlainPostBody></div>}
    <div className={styles.postMedia} data-post-media="">
    {presentation === "board" && detail ? <PostAttachmentViewer key={[...looseAssets.map(asset=>asset.id),looseVideo?.id].join(":")} assets={looseAssets} video={looseVideo} publicFanPost={post.celebritySlug!==WAVE_FANPAGE_SLUG} locale={locale}/> : <>
    {post.assets.length > 0 && <div className={`${styles.photos} ${styles.postPhotos}`}>{post.assets.map(asset => <ContentAssetImage key={asset.id} asset={asset} locale={locale} alt={copy.photo} />)}</div>}
    {post.video && (detail ? <AuthenticatedMedia asset={{ ...post.video, kind: "video" }} publicFanPost={post.celebritySlug!==WAVE_FANPAGE_SLUG} locale={locale} alt={waveMediaCopy(locale).play} play /> : <Link href={href} aria-label={waveMediaCopy(locale).play}><AuthenticatedMedia asset={{ ...post.video, kind: "video" }} publicFanPost={post.celebritySlug!==WAVE_FANPAGE_SLUG} locale={locale} alt={waveMediaCopy(locale).play} retryable={false} /></Link>)}
    </>}
    </div>

    {presentation !== "board" && displayedBody && <ContentTranslation sourceText={post.body} targetType="fan_post" targetId={post.id} locale={locale} sourceRevision={post.revision}><p className={styles.body}><LinkifiedText text={displayedBody} locale={locale} /></p></ContentTranslation>}
    {boardDetail ? <div className={detailStyles.bodyEnd}>
      <PostReactions {...reactionState} locale={locale} busy={!auth.ready || mutation.busy} loginHref={auth.ready && !auth.authenticated ? String(loginHref) : undefined} onChange={choice => void react(choice)} reward={auth.authenticated && !post.isOwner && reactionState.reaction === null} />
      <PostShareAction title={post.body.split("\n")[0] ?? ""} locale={locale} contentType="post" />
    </div> : <div className={`${styles.actions} ${styles.postFooter}`}><button type="button" className={styles.likeButton} onClick={() => void like()} disabled={!auth.ready || !auth.authenticated || mutation.busy} aria-pressed={liked}><ReactionIcon kind="like" size={20} pressed={liked} /> {boardLikeLabel??copy.like} <ReactionCount value={likeCount} locale={locale} />{boardLikeReward}</button>
      {!detail && <Link href={`${href}#comments` as Route} className={styles.button}><ReactionIcon kind="comment" /> {copy.comments} <ReactionCount value={post.commentCount} locale={locale} /></Link>}
      <RelativeTime className={styles.postDate} value={post.createdAt} locale={locale} />{isEdited(post) && <EditedMark className={styles.editedMark} locale={locale} />}
    </div>}
    {deleting&&<SourceConfirmDialog sourceId={deleteUncertain?'jU13c':'fNe6I'} title={deleteUncertain?sourceDeleteResultCopy(locale).title:locale==='ko'?'게시글을 삭제할까요?':copy.deleteConfirm} cancelLabel={copy.cancel} confirmLabel={deleteUncertain?sourceDeleteResultCopy(locale).check:copy.delete} closeLabel={copy.cancel} pending={mutation.busy} danger={!deleteUncertain} onClose={()=>setDeleting(false)} onConfirm={()=>void remove()}><p>{post.body.split('\n')[0]}</p>{deleteUncertain&&<p>{sourceDeleteResultCopy(locale).body}</p>}</SourceConfirmDialog>}
    {editBlocked && <p className={styles.error} role="alert">{editorText(locale, "bodyDocUnavailable")}</p>}
    {mutation.error && !passportRequired && <p className={styles.error} role="alert">{mutation.error}</p>}<PassportRequiredDialog failure={mutation.failure} slug={post.celebritySlug} locale={locale} onClose={mutation.dismiss} />
  </article>;
}
