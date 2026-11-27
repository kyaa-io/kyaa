"use client";

import { useState } from "react";
import type { Route } from "next";
import { z } from "zod";
import { FanAction } from "@/components/fan-ui/fan-action";
import { FanHeading } from "@/components/fan-ui/fan-heading";
import { FanSkeleton } from "@/components/fan-ui/fan-skeleton";
import { FanState } from "@/components/fan-ui/fan-state";
import { FanText } from "@/components/fan-ui/fan-text";
import { RewardIcon } from "@/components/fan-ui/reward-icon";
import { dukjilText } from "@/features/dukjil/ui/dukjil-copy";
import { toContentLocale, type AppLocale } from "@/i18n/locales";
import { seeAllLabel } from "./group-directory";
import { groupsCopy } from "./copy";
import { useGroupResource } from "./use-group-resource";
import styles from "./duo-lucky.module.css";

const response = z.object({
  items: z.array(z.object({
    key: z.string(), title: z.string(), closesAt: z.iso.datetime({ offset: true }),
    image: z.string().nullable(),
    resultPath: z.string().regex(/^\/(?:notices\/[a-z0-9-]+|c\/[a-z0-9-]+\/raffles\/[a-f0-9-]+)$/i).nullable(),
  })),
  hasMore: z.boolean(),
});
const parse = (value: unknown) => response.parse(value);

export function PastDrawArchive({ locale }: { locale: AppLocale }) {
  const [page, setPage] = useState(0);
  const ko = locale === "ko";
  const title = dukjilText(locale, "luckyPast");
  const archive = useGroupResource(`/api/raffles/archive?locale=${toContentLocale(locale)}${page ? `&page=${page}` : ""}`, parse);
  const format = new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Seoul" });
  return <section className={styles.pastList} aria-label={title} data-lucky-past>
    <div className={styles.archiveHeader}>
      <FanHeading>{title}</FanHeading>
      <FanAction variant="text" aria-expanded={page > 0} onClick={() => setPage(page ? 0 : 1)}>
        {page ? (ko ? "접기" : "Show less") : seeAllLabel[locale]}
      </FanAction>
    </div>
    {archive.loading ? <FanSkeleton width="100%" height={72} /> :
      archive.error ? <FanState inline compact kind="error" title={dukjilText(locale, "luckyLoadError")}
        actions={<FanAction variant="text" onClick={archive.retry}>{groupsCopy(locale).retry}</FanAction>} /> :
      archive.data?.items.length ? <ul className={styles.archiveRows} aria-live="polite">
        {archive.data.items.map(item => <li data-row className={styles.pastCard} key={item.key}>
          {item.image ? <img src={item.image} className={styles.thumbnail} width={56} height={56} alt="" loading="lazy" />
            : <RewardIcon kind="ticket" className={styles.thumbnail} size={56} />}
          <div className={styles.pastCopy}>
            <FanText as="strong" role="item">{item.title}</FanText>
            <time className={styles.meta} dateTime={item.closesAt}>{dukjilText(locale, "luckyClosesAt", [format.format(Date.parse(item.closesAt))])}</time>
          </div>
          {item.resultPath && <FanAction variant="text" href={`${item.resultPath}?locale=${locale}` as Route}>
            {ko ? "당첨 결과 보기" : dukjilText(locale, "luckyResults")}
          </FanAction>}
        </li>)}
      </ul> : <FanState inline compact kind="empty" title={ko ? "지난 럭키드로우가 없습니다." : "There are no past lucky draws."} />}
    {page > 0 && <nav className={styles.archiveHeader} aria-label={title}>
      <FanAction variant="text" disabled={page === 1} onClick={() => setPage(page - 1)}>{ko ? "이전" : "Previous"}</FanAction>
      <FanText role="label" aria-live="polite">{page}</FanText>
      <FanAction variant="text" disabled={!archive.data?.hasMore} onClick={() => setPage(page + 1)}>{ko ? "다음" : "Next"}</FanAction>
    </nav>}
  </section>;
}
