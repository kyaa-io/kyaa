"use client";
import { z } from "zod";
import type { AppLocale } from "@/i18n/locales";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { openProfileWindow } from "@/features/group-social/profile-window";
import { groupsCopy } from "./copy";
import { fanLoginHref } from "@/components/login-href";
import { useGroupRequest, useGroupResource } from "./use-group-resource";
import styles from "./directory-search-posts.module.css";
const schema = z.object({ items: z.array(z.object({ profileId: z.uuid(), nickname: z.string() })) });
const parse = (value: unknown) => schema.parse(value);
export const userSearchLabels: Record<AppLocale, string> = {ko:"유저",en:"Users",ja:"ユーザー","zh-Hans":"用户","zh-Hant":"用戶",es:"Usuarios",id:"Pengguna",vi:"Người dùng",th:"ผู้ใช้",pt:"Usuários",fr:"Utilisateurs",ru:"Пользователи"};
export function DirectorySearchUsers({ locale, search }: { locale: AppLocale; search: string }) {
 const q = search.trim(), t = groupsCopy(locale), auth = useGroupRequest();
 const resource = useGroupResource(auth.authenticated && q.length >= 2 ? `/api/me/social/search?${new URLSearchParams({q})}` : null, parse);
 if (auth.ready && !auth.authenticated) return <FanAction variant="text" href={fanLoginHref(locale, `/pages/groups?locale=${locale}&search=${encodeURIComponent(q)}`)}>{t.login}</FanAction>;
 if (q.length < 2) return null;
 if (resource.error) return <FanState kind="error" title={t.error} actions={<FanAction variant="text" onClick={resource.retry}>{t.retry}</FanAction>}/>;
 if (!resource.data) return <FanSkeletonRows rows={3} ariaLabel={userSearchLabels[locale]}/>;
 if (!resource.data.items.length) return <FanState kind="empty" title={t.empty}/>;
 return <div className={styles.list}>{resource.data.items.map(person => <FanAction key={person.profileId} variant="text" onClick={() => openProfileWindow({ profileId: person.profileId, nickname: person.nickname, avatarUrl: null })}>{person.nickname}</FanAction>)}</div>;
}
