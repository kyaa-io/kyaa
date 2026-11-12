import { RaffleContent } from './content';
import { notFound } from 'next/navigation';
import { FanAppFrame } from '@/components/fan-shell/fan-app-shell';
import { FanContentContainer } from '@/components/fan-shell/fan-content-container';
import { parseAppLocale } from '@/i18n/locales';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';
import { localSignupEnabled } from '@/server/signup-event/local';
import { rafflePolicySchema } from '@/features/benefit/domain/signup-event';
import type { RafflePreview } from './participation';
import styles from './raffle.module.css';
export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<{ locale?: string | string[]; preview?: string | string[] }> };
export async function generateMetadata({ searchParams }: Props) {
  const locale = parseAppLocale((await searchParams).locale);
  return { title: signupRaffleText(locale, 'title'), description: `US$400 · ${signupRaffleText(locale, 'winners')} · ${signupRaffleText(locale, 'deadline')}` };
}
const kstDay = (time: number) => Math.floor((time + 9 * 3600_000) / 86_400_000);
const previews = ['in', 'entered', 'passport', 'done', 'error'] as const;
export default async function RafflePage({ searchParams }: Props) {
  if (!localSignupEnabled()) notFound();
  const query = await searchParams;
  const locale = parseAppLocale(query.locale);
  const now = Date.now();
  const closesAt = Date.parse(rafflePolicySchema.parse({}).closesAt);
  // 개발 서버에서만: 상태별 화면 확인용(?preview=in|entered|passport|done|error|closed). 운영 빌드에서는 무시한다.
  const requested = process.env.NODE_ENV === 'production' ? undefined : query.preview;
  const preview = previews.find(value => value === requested) as RafflePreview;
  const closed = now > closesAt || requested === 'closed';
  return <FanAppFrame locale={locale} currentPath="/s/raffle" mainId="raffle-main">
    <div className={styles.stage}>
      <FanContentContainer as="main" id="raffle-main" className={styles.column}>
        <RaffleContent locale={locale} daysLeft={kstDay(closesAt) - kstDay(now)} closed={closed} preview={preview} />
      </FanContentContainer>
    </div>
  </FanAppFrame>;
}
