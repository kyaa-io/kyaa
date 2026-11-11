"use client";
import { useState } from "react";
import { z } from "zod";
import { useByUsAuth } from "@/features/auth/client/cognito-auth";
import { useCommunityResource } from "@/features/fanpage/ui/use-community-resource";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { PostReactions, applyReaction, type PostReactionChoice } from "@/features/fan-posts/ui/post-reactions";
import { PostShareAction } from "@/features/fan-posts/ui/post-share-action";
import type { AppLocale } from "@/i18n/locales";
import styles from "@/features/fan-posts/ui/post-detail.module.css";
const schema = z.object({ reaction: z.enum(["like", "dislike"]).nullable(), likeCount: z.number().int().nonnegative(), dislikeCount: z.number().int().nonnegative().nullable() }).strict();
const parse = (value: unknown) => schema.parse(value);
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
  const href = `/c/${slug}/notices/${noticeSlug}?locale=${locale}`;
  async function change(reaction: PostReactionChoice) {
    if (!state) return;
    setOptimistic(applyReaction(state, reaction));
    const result = await mutation.request(endpoint, "PUT", { reaction });
    const parsed = schema.safeParse(result);
    setOptimistic(parsed.success ? parsed.data : null);
    resource.retry();
  }
  return <><div className={styles.bodyEnd}>
    <PostReactions reaction={state?.reaction ?? null} likeCount={state?.likeCount ?? 0} dislikeCount={state?.dislikeCount ?? null} locale={locale} busy={!auth.ready || !state || mutation.busy} loginHref={auth.ready && !auth.authenticated ? `/login?locale=${locale}&returnTo=${encodeURIComponent(href)}` : undefined} onChange={choice => void change(choice)} />
    <PostShareAction title={title} locale={locale} contentType="notice" url={href} />
  </div>{mutation.error && <p role="alert">{mutation.error}</p>}</>;
}
