"use client";
import { formatMileage } from "@/i18n/format-mileage";
import { useRef, useState } from "react";
import { FanActivityStamp } from "@/components/fan-ui/fan-activity-stamp";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanIcon } from "@/components/fan-ui/fan-icon";
import { useGroupRequest } from "@/features/groups/ui/use-group-resource";
import { FanNumber } from "@/components/fan-ui/fan-number";
import { Check } from "@/components/fan-ui/fan-icons";

import type { GroupPage } from "@/features/groups/domain/contracts";
import { GroupImage } from "@/features/groups/ui/group-image";
import type { AppLocale } from "@/i18n/locales";
import type { DukjilAttendanceList } from "../domain/dukjil-ui";
import { CreatorAttendanceDialog } from "./creator-attendance-dialog";
import { dukjilText } from "./dukjil-copy";
import { DukjilProvider } from "./dukjil-provider";

import styles from "./attendance-avatars.module.css";

type Creator = GroupPage & { slug: string };
type Item = DukjilAttendanceList["items"][number] | undefined;

/** `연속 {0}일`의 숫자만 크게 보이도록 번역 문구를 숫자 앞뒤로 나눈다(언어마다 숫자 위치가 다르다). */
function StreakFigure({ locale, streak }: { locale: AppLocale; streak: number }) {
  const [before, after] = dukjilText(locale, "dukjilStreak", ["\u0001"]).split("\u0001");
  return <small className={styles.streak}><FanActivityStamp kind="streak" size="sm" />{before}<FanNumber value={streak} size="lg" locale={locale} />{after}</small>;
}

const bulkCopy: Record<AppLocale, [string, string]> = {
  ko: ["모두 출석하기 ({0}곳)", "{0}곳"], en: ["Check in to all ({0})", "{0} pages"],
  ja: ["一括チェックイン（{0}件）", "{0}件"], "zh-Hans": ["全部签到（{0}个）", "{0}个页面"],
  "zh-Hant": ["全部簽到（{0}個）", "{0}個頁面"], es: ["Registrar asistencia en todas ({0})", "{0} páginas"],
  id: ["Absen di semua ({0})", "{0} halaman"], vi: ["Điểm danh tất cả ({0})", "{0} trang"],
  th: ["เช็กอินทั้งหมด ({0})", "{0} หน้า"], pt: ["Registrar presença em todas ({0})", "{0} páginas"],
  fr: ["Pointer partout ({0})", "{0} pages"], ru: ["Отметиться везде ({0})", "Страниц: {0}"],
  mn: ["Бүгдэд ирц бүртгүүлэх ({0})", "{0} хуудас"],
};

type BatchItem = { slug: string; ok: boolean; replayed?: boolean; points?: number };

/** 내 페이지 출석 현황: 아바타, 이름과 상태, 출석 행동을 한 행에 둔다. */
export function AttendanceAvatars({ locale, creators, byId, verifyHref, onChanged }: {
  locale: AppLocale; creators: Creator[]; byId: ReadonlyMap<string, NonNullable<Item>>; verifyHref: (page: Creator) => string; onChanged: () => void;
}) {
  const { request } = useGroupRequest();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [error, setError] = useState(false);
  const pending = creators.filter(page => {
    const item = byId.get(page.celebrityId!);
    return item?.hasPassport && !item.attendedToday;
  });
  const earned = items.filter(item => item.ok && !item.replayed);
  async function checkAll() {
    if (locked.current || !pending.length) return;
    locked.current = true;
    setBusy(true);
    setError(false);
    setItems([]);
    try {
      const result = await request("/api/me/attendance", {
        method: "POST", body: JSON.stringify({ creators: pending.map(page => page.slug) }),
      });
      setItems(result.items);
    } catch {
      setError(true);
    } finally {
      onChanged();
      locked.current = false;
      setBusy(false);
    }
  }
  return <>
    <FanAction variant="primary" disabled={busy || !pending.length} onClick={checkAll}>{bulkCopy[locale][0].replace("{0}", String(pending.length))}</FanAction>
    <div role="status">{error ? dukjilText(locale, "dukjilFailed") : items.length > 0 && `${formatMileage(earned.reduce((sum, item) => sum + (item.points ?? 0), 0), locale, "always")} · ${bulkCopy[locale][1].replace("{0}", String(earned.length))}`}</div>
    <ul className={styles.list}>{creators.map(page => <AvatarItem key={page.id} failed={items.some(item => item.slug === page.slug && !item.ok)} page={page} locale={locale} item={byId.get(page.celebrityId!)} reviewHref={verifyHref(page)} onChanged={onChanged} />)}</ul>
  </>;
}

function AvatarItem({ failed, page, locale, item, reviewHref, onChanged }: { failed: boolean; page: Creator; locale: AppLocale; item: Item; reviewHref: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const attended = Boolean(item?.attendedToday);
  return (
    <li className={styles.item} data-row="">

        <span className={styles.avatar} role="img" aria-label={page.name} data-attended={attended ? "true" : "false"}>
          {page.imageUrl ? <GroupImage locale={locale} src={page.imageUrl} alt="" width={40} height={40} className={styles.image} /> : <span className={styles.image} aria-hidden="true" />}
        </span>

      <span className={styles.copy}><strong>{page.name}</strong>{failed && !attended && <small>{dukjilText(locale, "dukjilFailed")}</small>}{item && item.streak > 0 ? <StreakFigure locale={locale} streak={item.streak} /> : null}</span>
      {attended && <FanAction className={styles.action} disabled onClick={() => setOpen(true)}><FanIcon icon={Check} size={16} />{dukjilText(locale, "dukjilBadgeDone")}</FanAction>}
      {!attended && (item && !item.hasPassport
        ? <FanAction className={styles.action} href={reviewHref}>{dukjilText(locale, "dukjilReview")}</FanAction>
        : <FanAction className={styles.action} onClick={() => setOpen(true)}>{dukjilText(locale, "dukjilCheckInShort")}</FanAction>)}
      {open && <DukjilProvider slug={page.slug} locale={locale} hasPassport={item?.hasPassport}><CreatorAttendanceDialog open pageName={page.name} reviewHref={reviewHref} onClose={() => { setOpen(false); onChanged(); }} /></DukjilProvider>}
    </li>
  );
}
