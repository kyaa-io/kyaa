"use client";
import { Heart } from "lucide-react";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import type { Route } from "next";
import { useState } from "react";
import { useContentMutation } from "@/features/content-safety/ui/use-content-mutation";
import { contentCopy } from "@/i18n/catalogs/features__fan_posts__ui";
import type { AppLocale } from "@/i18n/locales";
import styles from "./comment-like.module.css";

export type CommentReaction = { emoji: "❤" | "👏" | "✨"; count: number; selected: boolean };
const HEART = "❤";

/** 댓글 하트. 기존 PUT /api/post-comments/{id}/reaction 에 연결하고 실패하면 되돌린다. */
export function CommentLike({ commentId, locale, reactions, loginHref }: { commentId: string; locale: AppLocale; reactions: readonly CommentReaction[]; /** Signed-out readers see the count and go to login. */ loginHref?: Route }) {
  const mutation = useContentMutation(locale), copy = contentCopy(locale);
  const initial = reactions.find(item => item.emoji === HEART);
  const [state, setState] = useState({ selected: initial?.selected ?? false, count: initial?.count ?? 0 });
  async function toggle() {
    const previous = state, selected = !previous.selected;
    setState({ selected, count: Math.max(0, previous.count + (selected ? 1 : -1)) });
    const value = await mutation.request(`/api/post-comments/${commentId}/reaction`, "PUT", { emoji: selected ? HEART : null }) as { reactions?: CommentReaction[] } | null;
    if (!value) { setState(previous); return; }
    const saved = value.reactions?.find(item => item.emoji === HEART);
    setState({ selected: saved?.selected ?? selected, count: saved?.count ?? (selected ? previous.count + 1 : Math.max(0, previous.count - 1)) });
  }
  if (loginHref) return <Link className={styles.like} href={loginHref} aria-label={copy.like}><Heart size={16} aria-hidden="true" /><span>{state.count > 0 ? state.count : ""}</span></Link>;
  return <>
    <button type="button" className={styles.like} aria-pressed={state.selected} aria-label={copy.like} disabled={mutation.busy} onClick={() => void toggle()}>
      <Heart size={16} aria-hidden="true" fill={state.selected ? "currentColor" : "none"} /><span>{state.count > 0 ? state.count : ""}</span>
    </button>
    {mutation.error && <span role="alert" className={styles.error}>{mutation.error}</span>}
  </>;
}
