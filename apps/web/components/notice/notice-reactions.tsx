"use client";
import { useRef, useState } from "react";
import { z } from "zod";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { PostReactions, applyReaction, type PostReactionChoice } from "@/features/fan-posts/ui/post-reactions";
import { PostShareAction } from "@/features/fan-posts/ui/post-share-action";
import { celebrateReward } from "@/components/fan-ui/reward-celebration";
import { registrationReward } from "@/features/fan-posts/domain/registration-reward";
import type { AppLocale } from "@/i18n/locales";
import styles from "@/features/fan-posts/ui/post-detail.module.css";
const schema = z.object({ reaction: z.enum(["like", "dislike"]).nullable(), likeCount: z.number().int().nonnegative(), dislikeCount: z.number().int().nonnegative().nullable() }).strict();
const parse = (value: unknown) => schema.parse(value);
/** A write answers with the state plus an optional `reward`. */
const answerSchema = z.object(schema.shape);
export function NoticeReactions(props: { slug: string; noticeSlug: string; title: string; locale: AppLocale }) {
  const auth = useByUsAuth();
  return <ReactionsForOwner key={`${props.slug}:${props.noticeSlug}:${auth.user?.id ?? "guest"}`} {...props} />;
}
function ReactionsForOwner({ slug, noticeSlug, title, locale }: { slug: string; noticeSlug: string; title: string; locale: AppLocale }) {
  const auth = useByUsAuth(), mutation = useContentMutation(locale);
  const endpoint = `/api/celebrities/${slug}/notices/${noticeSlug}/reaction?locale=${locale}`;
  const resource = useCommunityResource(endpoint, parse);
  const [optimistic, setOptimistic] = useState<z.infer<typeof schema> | null>(null);
  const state = optimistic ?? (resource.state.status === "ready" ? resource.state.data : null);
  const href = `/c/${slug}/notices/${noticeSlug}?locale=${locale}`, row = useRef<HTMLDivElement>(null);
  async function change(reaction: PostReactionChoice) {
    if (!state) return;
    setOptimistic(applyReaction(state, reaction));
    const result = await mutation.request(endpoint, "PUT", { reaction });
    // The answer carries the new state and, for a first reaction that paid, the reward (same shape as a fan board like).
    const parsed = answerSchema.safeParse(result), reward = registrationReward(result);
    setOptimistic(parsed.success ? parsed.data : null);
    if (reward) celebrateReward({ locale, ...reward, anchor: row.current?.querySelector(`.${reaction === "dislike" ? styles.reactionDislike : styles.reactionLike}`) });
    resource.retry();
  }
  return <><div className={styles.bodyEnd} ref={row}>
    <PostReactions reaction={state?.reaction ?? null} likeCount={state?.likeCount ?? 0} dislikeCount={state?.dislikeCount ?? null} locale={locale} busy={!auth.ready || !state || mutation.busy} loginHref={auth.ready && !auth.authenticated ? `/login?locale=${locale}&returnTo=${encodeURIComponent(href)}` : undefined} onChange={choice => void change(choice)} reward={auth.authenticated && state?.reaction === null} />
    <PostShareAction title={title} locale={locale} contentType="notice" url={href} />
  </div>{mutation.error && <p role="alert">{mutation.error}</p>}</>;
}
