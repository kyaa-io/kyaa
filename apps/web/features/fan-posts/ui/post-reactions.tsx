"use client";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { FanAction } from "@/components/fan-ui/fan-action";
import { EarnBadgeCorner } from "@/features/dukjil/ui/earn-badge";
import type { AppLocale } from "@/i18n/locales";
import { fill, postReactionCopy } from "./post-reaction-copy";
import styles from "./post-detail.module.css";

/**
 * 261107-2 C4. Thumbs up and thumbs down under a post (fan board and group board). The heart stays the "cheer" sign elsewhere.
 * Only likes have a public number. dislikeCount is a number only when the server says this reader wrote the post or runs the page.
 */
export type PostReaction = "like" | "dislike" | null;
export type PostReactionChoice = "like" | "dislike" | "none";
export type PostReactionState = { reaction: PostReaction; likeCount: number; dislikeCount: number | null };

/** Pressing the chosen thumb again cancels it; pressing the other one switches. */
export function nextReaction(current: PostReaction, pressed: "like" | "dislike"): PostReactionChoice {
  return current === pressed ? "none" : pressed;
}

/** The optimistic state after a choice. Counts never go below zero; a hidden dislike count stays hidden. */
export function applyReaction(state: PostReactionState, choice: PostReactionChoice): PostReactionState {
  const next: PostReaction = choice === "none" ? null : choice;
  const delta = (kind: "like" | "dislike") => (next === kind ? 1 : 0) - (state.reaction === kind ? 1 : 0);
  return {
    reaction: next,
    likeCount: Math.max(0, state.likeCount + delta("like")),
    dislikeCount: state.dislikeCount === null ? null : Math.max(0, state.dislikeCount + delta("dislike")),
  };
}

type Props = PostReactionState & {
  locale: AppLocale;
  busy?: boolean;
  /** Signed out: both thumbs lead to sign-in. */
  loginHref?: string;
  /** Signed in but not a member: both thumbs start joining (disabled when joining is not offered or is pending). */
  join?: { onJoin?: () => void; pending?: boolean };
  onChange: (choice: PostReactionChoice) => void;
  /** Show the point badge on the thumbs up (a like that would pay). */
  likeReward?: boolean;
};

export function PostReactions({ reaction, likeCount, dislikeCount, locale, busy = false, loginHref, join, onChange, likeReward = false }: Props) {
  const t = postReactionCopy(locale), likes = likeCount.toLocaleString(locale);
  const dislikeLabel = dislikeCount === null ? t.dislike : fill(t.dislikeCount, dislikeCount.toLocaleString(locale));
  const likeIcon = <ThumbsUp strokeWidth={1.75} />, dislikeIcon = <ThumbsDown strokeWidth={1.75} />;
  const dislikeNumber = dislikeCount === null ? undefined : <span className={styles.reactionPrivateCount}>{dislikeCount.toLocaleString(locale)}</span>;
  const shared = { variant: "neutral" as const };
  const likeProps = { ...shared, className: styles.reactionLike, leadingIcon: likeIcon };
  const dislikeProps = { ...shared, className: styles.reactionDislike, leadingIcon: dislikeIcon, ariaLabel: dislikeLabel };
  const likeText = `${t.like} ${likes}`;
  let like, dislike;
  if (loginHref) {
    like = <FanAction {...likeProps} href={loginHref}>{likeText}</FanAction>;
    dislike = <FanAction {...dislikeProps} href={loginHref}>{dislikeNumber}</FanAction>;
  } else if (join) {
    const disabled = !join.onJoin || join.pending;
    like = <FanAction {...likeProps} disabled={disabled} onClick={join.onJoin}>{likeText}</FanAction>;
    dislike = <FanAction {...dislikeProps} disabled={disabled} onClick={join.onJoin}>{dislikeNumber}</FanAction>;
  } else {
    like = <FanAction {...likeProps} aria-pressed={reaction === "like"} disabled={busy} onClick={() => onChange(nextReaction(reaction, "like"))}>{likeText}</FanAction>;
    dislike = <FanAction {...dislikeProps} aria-pressed={reaction === "dislike"} disabled={busy} onClick={() => onChange(nextReaction(reaction, "dislike"))}>{dislikeNumber}</FanAction>;
  }
  return <>{likeReward ? <EarnBadgeCorner action="reaction" locale={locale}>{like}</EarnBadgeCorner> : like}{dislike}</>;
}
