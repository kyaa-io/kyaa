"use client";
import type { ReactNode } from "react";
import { LockKeyhole, MessagesSquare } from "@/components/fan-ui/fan-icons";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanStarAction } from "@/components/fan-ui/fan-star-action";
import { FanSurface } from "@/components/fan-ui/fan-surface";
import { FanText } from "@/components/fan-ui/fan-text";
import { fanLoginHref } from "@/components/login-href";
import { groupChatSchema } from "../domain/contracts";
import { chatCopy } from "./chat-copy";
import { groupsCopy, pageUnavailable } from "./copy";
import { useOptionalGroupPage } from "./group-page-context";
import { RoomMessages } from "./group-rooms-panel";
import { useGroupRequest, useGroupResource } from "./use-group-resource";
import roomStyles from "./group-rooms.module.css";

const parseChat = (value: unknown) => groupChatSchema.parse(value);

/** 팬페이지 하나의 '채팅방(임시운영)'(대표 11/19 20:35). 팬인증 회원과 확인된 크리에이터 본인만 읽고 쓴다. 들어갈 수 없으면 그 조건과 다음 행동 하나만 보인다. */
export function GroupChatPanel({ pageId, locale, roomHref }: { pageId: string; locale: AppLocale; roomHref: string }) {
  const t = groupsCopy(locale), c = chatCopy(locale), auth = useGroupRequest(), g = useOptionalGroupPage();
  const url = `/api/groups/${pageId}/chat`;
  const access = useGroupResource(auth.ready && auth.authenticated ? `${url}?limit=1` : null, parseChat);
  const heading = <header className={roomStyles.chatHead}><FanIcon icon={MessagesSquare} size={24} /><FanHeading>{c.title}</FanHeading></header>;
  const gate = (message: string, action: ReactNode) => <FanSurface className={roomStyles.closedRoom}><FanIcon icon={LockKeyhole} size={24} /><FanHeading>{c.title}</FanHeading><FanText as="p" role="body">{message}</FanText>{action}</FanSurface>;
  if (!auth.ready || (auth.authenticated && access.loading && !access.data && !access.error)) return <section className={roomStyles.roomsPanel} aria-busy="true">{heading}<FanSkeleton width="100%" height={380} /></section>;
  if (!auth.authenticated) return <section className={roomStyles.roomsPanel}>{gate(c.loginOnly, <FanAction variant="primary" href={fanLoginHref(locale, roomHref)}>{t.login}</FanAction>)}</section>;
  const status = access.failure?.status;
  if (access.error && status === 403) return <section className={roomStyles.roomsPanel}>{gate(c.verifiedOnly, g?.star ? <FanStarAction {...g.star} /> : null)}</section>;
  if (access.error) return <section className={roomStyles.roomsPanel}>{heading}<div className={roomStyles.roomNotice} role="alert"><p>{status === 404 ? pageUnavailable[locale] : t.error}</p>{status === 404 ? null : <FanAction onClick={access.retry}>{t.retry}</FanAction>}</div></section>;
  return <section className={roomStyles.roomsPanel} data-group-chat="">{heading}
    <RoomMessages key={auth.ownerKey} pageId={pageId} locale={locale} chat={{ url, title: c.title, creatorLabel: c.creator, rateLimited: c.rateLimited }} />
  </section>;
}
