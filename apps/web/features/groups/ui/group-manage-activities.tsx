"use client";
import { ArrowLeft, ListChecks, Plus } from "lucide-react";
import type { Route } from "next";
import Link from "../../../components/fan-ui/hover-prefetch-link";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanSkeletonRows } from "@/components/fan-ui/fan-skeleton";
import { FanTag } from "@/components/fan-ui/fan-tag";
import { CreateGroupRaffle } from "@/features/group-raffle/create-raffle";
import { raffleCopy } from "@/features/group-raffle/copy";
import { GroupRaffleList } from "@/features/group-raffle/raffle-list";
import type { AppLocale } from "@/i18n/locales";
import { groupMissionsSchema } from "@/server/group-activities/domain";
import { activitiesCopy } from "./activities-copy";
import { groupsCopy } from "./copy";
import { usePaged } from "./group-activities";
import { GroupMissionEditor } from "./group-activity-editors";
import { GroupMissionStats } from "./group-mission-stats";
import { GroupImage } from "./group-image";
import { manageFormText } from "./manage-form-copy";
import { useAddressParam } from "./use-address-param";
import styles from "./groups.module.css";
import listStyles from "./group-event-list.module.css";

const parseMissions = (value: unknown) => groupMissionsSchema.parse(value);
const missionItems = (value: ReturnType<typeof parseMissions>) => value.missions;

/** 운영 관리의 미션 탭. 위에 미션 현황 표, 아래에 행사 탭과 같은 목록과 만들기 버튼이 있고, 만들기는 같은 자리에서 폼으로 바뀐다. */
export function GroupManageMissions({ pageId, pageName, locale }: { pageId: string; pageName?: string; locale: AppLocale }) {
  const t = groupsCopy(locale), c = activitiesCopy(locale), [creating, setCreating] = useAddressParam("new");
  const r = usePaged(`/api/groups/${pageId}/missions`, parseMissions, missionItems);
  if (creating) return <div id="missions"><FanAction variant="text" leadingIcon={<ArrowLeft />} onClick={() => setCreating(null)}>{c.missions}</FanAction><GroupMissionEditor pageId={pageId} pageName={pageName} locale={locale} done={() => { setCreating(null); r.retry(); }} /></div>;
  return <><GroupMissionStats pageId={pageId} locale={locale} /><section id="missions" className={styles.panel}>
    <div className={listStyles.head}><h2>{c.missions}</h2><span className={listStyles.headAction}><FanAction variant="primary" leadingIcon={<Plus />} onClick={() => setCreating("1")}>{c.createMission}</FanAction></span></div>
    {r.error ? <div role="alert"><p>{t.error}</p><FanAction onClick={r.retry}>{t.retry}</FanAction></div> : r.loading ? <FanSkeletonRows rows={3} variant="entity" ariaLabel={t.loading} /> : r.items.length ? r.items.map(item => <Link key={item.id} className={styles.card} href={`${item.actionHref}?locale=${locale}` as Route}>
      {item.imageUrl ? <GroupImage locale={locale} className={styles.avatar} width={48} height={48} src={item.imageUrl} alt="" /> : <ListChecks aria-hidden="true" />}
      <span className={styles.cardCopy}><strong>{item.title}</strong><span className={styles.meta}>{item.rewardPoints.toLocaleString(locale)} P</span>{item.state !== "published" && <FanTag tone="neutral" className={listStyles.status}>{item.state === "draft" ? c.draft : c.closed}</FanTag>}</span>
    </Link>) : <p>{manageFormText(locale, "missionsNone")}</p>}
    {r.data?.nextCursor && <FanAction onClick={r.more}>{t.more}</FanAction>}
  </section></>;
}

/** 운영 관리의 추첨 탭. 승인된 선물에서 들어오면 폼부터 연다. */
export function GroupManageRaffles({ pageId, pageName, pageKind, locale, initialGiftId }: { pageId: string; pageName?: string; pageKind?: string; locale: AppLocale; initialGiftId?: string }) {
  const c = raffleCopy(locale), [creating, setCreating] = useAddressParam("new");
  if (creating || initialGiftId) return <div id="raffles"><FanAction variant="text" leadingIcon={<ArrowLeft />} href={`/pages/groups/${pageId}/manage?section=raffles&locale=${locale}`} onClick={initialGiftId ? undefined : event => { event.preventDefault(); setCreating(null); }}>{c.title}</FanAction><CreateGroupRaffle pageId={pageId} pageName={pageName} pageKind={pageKind} locale={locale} initialGiftId={initialGiftId} /></div>;
  return <div id="raffles"><GroupRaffleList pageId={pageId} locale={locale} emptyLabel={manageFormText(locale, "raffleNone")} action={<FanAction variant="primary" leadingIcon={<Plus />} onClick={() => setCreating("1")}>{c.create}</FanAction>} /></div>;
}
