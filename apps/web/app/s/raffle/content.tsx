import { FanHeading } from '@/components/fan-ui/fan-heading';
import { FanText } from '@/components/fan-ui/fan-text';
import type { AppLocale } from '@/i18n/locales';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';
import { signupEvent } from '@/features/benefit/domain/signup-event';
import { RaffleParticipation } from './participation';
import styles from './raffle.module.css';
export function RaffleContent({ locale }: { locale: AppLocale }) {
  const text = (key: Parameters<typeof signupRaffleText>[1]) => signupRaffleText(locale, key);
  return <>
      <header className={styles.hero}>
        <div className={styles.intro}>
          <FanHeading as="h1" variant="campaign">{text('title')}</FanHeading>
          <FanText as="p" role="item">US$400 · {text('winners')}</FanText>
          <FanText as="p" role="body">{text('deadline')}</FanText>
        </div>
        <picture className={styles.artwork}>
          <source media="(min-width: 768px)" srcSet="/images/signup-raffle/desktop.webp" width="1440" height="900" />
          <img src="/images/signup-raffle/mobile.webp" width="390" height="390" alt="" />
        </picture>
      </header>
      <ul className={styles.prizes}>{signupEvent.prizes.map(prize => <li key={prize.usd} data-row="raffle-prize"><FanText role="item">US${prize.usd}</FanText><FanText role="body">{signupRaffleText(locale, 'prizeCount', prize.quantity)}</FanText></li>)}</ul>
      <ol className={styles.steps}>
        {(['stepEnter', 'stepPassport', 'stepCommunity'] as const).map(key => <li key={key} data-row="raffle-step"><FanText role="body">{text(key)}</FanText></li>)}
      </ol>
      <FanText as="p" role="body">{text('bonus')}</FanText>
      <RaffleParticipation locale={locale} />
  </>;
}
