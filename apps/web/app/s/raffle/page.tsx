import { RaffleContent } from './content';
import { notFound } from 'next/navigation';
import { FanAppFrame, FanContentContainer } from '@/components/fan-shell/fan-app-shell';
import { parseAppLocale } from '@/i18n/locales';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';
import { localSignupEnabled } from '@/server/signup-event/local';
import styles from './raffle.module.css';
export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<{ locale?: string | string[] }> };
export async function generateMetadata({ searchParams }: Props) {
  const locale = parseAppLocale((await searchParams).locale);
  return { title: signupRaffleText(locale, 'title'), description: `US$400 · ${signupRaffleText(locale, 'winners')} · ${signupRaffleText(locale, 'deadline')}` };
}
export default async function RafflePage({ searchParams }: Props) {
  if (!localSignupEnabled()) notFound();
  const locale = parseAppLocale((await searchParams).locale);
  return <FanAppFrame locale={locale} currentPath="/s/raffle" mainId="raffle-main">
    <FanContentContainer as="main" id="raffle-main" className={styles.event}>
      <RaffleContent locale={locale} />
    </FanContentContainer>
  </FanAppFrame>;
}
