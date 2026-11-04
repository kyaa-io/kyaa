import { FanAction } from "@/components/fan-ui/fan-action";
import type { AppLocale } from "@/i18n/locales";
import { walletCopy } from "@/features/group-wallet/ui/copy";
import styles from "./history-tabs.module.css";

export type HistoryTab = "ledger" | "participation";

/** Short tab names: [적립·사용, 참여]. The long names stay as panel headings. */
const tabNames: Record<AppLocale, readonly [string, string]> = {
  ko: ["적립·사용", "참여"],
  en: ["Earned & used", "Entries"],
  ja: ["獲得・利用", "参加"],
  "zh-Hans": ["收支", "参与"],
  "zh-Hant": ["收支", "參與"],
  es: ["Saldo", "Participación"],
  id: ["Poin", "Partisipasi"],
  vi: ["Giao dịch", "Tham gia"],
  th: ["รายการแต้ม", "การเข้าร่วม"],
  pt: ["Saldo", "Participação"],
  fr: ["Solde", "Participation"],
  ru: ["Баллы", "Участие"],
};

/** One history destination reached from the 덕질 title row; the two record kinds are tabs, each keeping its existing URL. */
export function HistoryTabs({ locale, active }: { locale: AppLocale; active: HistoryTab }) {
  const [ledger, participation] = tabNames[locale] ?? tabNames.en;
  const tabs = [
    { id: "ledger" as const, label: ledger, href: `/my/wallet?locale=${locale}#wallet-history` },
    { id: "participation" as const, label: participation, href: `/my/raffles?locale=${locale}` },
  ];
  return <nav className={styles.tabs} aria-label={walletCopy(locale).history}>
    {tabs.map(tab => <FanAction key={tab.id} variant="neutral" aria-current={tab.id === active ? "page" : undefined} href={tab.href}>{tab.label}</FanAction>)}
  </nav>;
}
