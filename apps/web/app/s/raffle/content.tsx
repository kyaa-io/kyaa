import type { AppLocale } from '@/i18n/locales';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';
import { raffleLongformText, type SignupRaffleLongformKey } from '@/i18n/catalogs/signup-raffle-longform';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { signupEvent } from '@/features/benefit/domain/signup-event';
import { RaffleHeroAction, RaffleProvider, RaffleShare, RaffleStatus, RaffleStepAction, RaffleStickyCta, type RafflePreview } from './participation';
import styles from './raffle.module.css';

const art = (name: string) => `/images/raffle/longform/${name}.webp`;
const medals = { 100: 'prize-100', 50: 'prize-50', 25: 'prize-25', 10: 'prize-10' } as const;

function Accent({ line, accent }: { line: string; accent: string }) {
  const at = line.indexOf(accent);
  return at < 0 ? <>{line}</> : <>{line.slice(0, at)}<mark>{accent}</mark>{line.slice(at + accent.length)}</>;
}

export function RaffleContent({ locale, daysLeft, closed, preview }: { locale: AppLocale; daysLeft: number; closed: boolean; preview?: RafflePreview }) {
  const text = (key: Parameters<typeof signupRaffleText>[1], count?: number) => signupRaffleText(locale, key, count);
  const t = (key: SignupRaffleLongformKey, count?: number) => raffleLongformText(locale, key, count);
  const left = closed ? t('ended') : daysLeft <= 0 ? t('lastDay') : t('daysLeft', daysLeft);
  const steps = [
    { n: 1 as const, title: t('enterTitle'), line: t('enterLine'), accent: t('enterAccent'), img: 'step-ticket', how: text('stepEnter') },
    { n: 2 as const, title: t('passportTitle'), line: t('passportLine'), accent: t('passportAccent'), img: 'step-passport', how: text('stepPassport') },
    { n: 3 as const, title: t('communityTitle'), line: t('communityLine'), accent: t('communityAccent'), img: 'step-community', how: text('stepCommunity') },
  ];
  return <RaffleProvider locale={locale} closed={closed} preview={preview}>
    <header className={styles.hero}>
      <img className={styles.heroDeco} src={art('deco')} alt="" width="512" height="512" />
      <p className={styles.kicker}>KYAA RAFFLE</p>
      <div className={styles.title}><FanHeading as="h1">{text('title')}</FanHeading></div>
      <p className={styles.amount}>US$400</p>
      <p className={styles.sub}>{text('winners')} · {text('deadline')}</p>
      <p className={styles.dday} data-urgent={!closed && daysLeft <= 1}>{left}</p>
      <img className={styles.machine} src={art('hero-machine')} alt="" width="640" height="640" fetchPriority="high" />
      <RaffleHeroAction />
      <p className={styles.kst}>{t('kst')}</p>
    </header>
    <div className={styles.sheet}>
      <RaffleStatus />
      {steps.map(step => <section key={step.n} className={styles.step} data-tone={step.n % 2 ? 'white' : 'pink'} aria-labelledby={`raffle-step-${step.n}`}>
        <p className={styles.chip}>{t('stepChip', step.n)}</p>
        <div className={styles.stepTitle}><FanHeading as="h2" id={`raffle-step-${step.n}`}>{step.title}</FanHeading></div>
        <img className={styles.stepArt} src={art(step.img)} alt="" width="360" height="360" loading="lazy" />
        <p className={styles.line}><Accent line={step.line} accent={step.accent} /></p>
        <div className={styles.how}><p className={styles.howTitle}>{t('howTo')}</p><p className={styles.howRow}><b>{step.n}</b>{step.how}</p></div>
        <RaffleStepAction step={step.n} />
      </section>)}
      <section className={styles.bonus} aria-labelledby="raffle-bonus">
        <img className={styles.bonusArt} src={art('bonus-plus')} alt="" width="240" height="240" loading="lazy" />
        <div className={styles.stepTitle}><FanHeading as="h2" id="raffle-bonus">{t('bonusTitle')}</FanHeading></div>
        <p className={styles.line}>{text('bonus')}</p>
        <ul className={styles.counters}>{([['bonusComment'], ['bonusAttend']] as const).map(([key]) => <li key={key} data-row="raffle-bonus">
          <span className={styles.counterName}>{t(key)}</span><strong>{t('bonusChance')}</strong>
          <span className={styles.slots} aria-hidden><i /><i /><i /></span><span className={styles.cap}>{t('bonusCap')}</span>
        </li>)}</ul>
      </section>
      <section className={styles.prizeBand} aria-labelledby="raffle-prizes">
        <div className={styles.prizeTitle}><FanHeading as="h2" id="raffle-prizes">+ {t('prizes')} +</FanHeading></div>
        <p className={styles.prizeTotal}>US$400 · {t('totalWinners')}</p>
        <ul className={styles.prizes}>{signupEvent.prizes.map(prize => <li key={prize.usd} data-row="raffle-prize" data-tier={prize.usd}>
          <img src={art(medals[prize.usd])} alt="" width="160" height="160" loading="lazy" />
          <strong>US${prize.usd}</strong><span>{text('prizeCount', prize.quantity)}</span>
        </li>)}</ul>
      </section>
      <section className={styles.foot}>
        <RaffleShare />
        <details className={styles.notice}><summary>{t('notice')}</summary>
          <ul>{(['notice1', 'notice2', 'notice3', 'notice4', 'notice5', 'notice6', 'notice7'] as const).map(key => <li key={key} data-row="raffle-terms">{t(key)}</li>)}</ul>
        </details>
      </section>
    </div>
    <RaffleStickyCta />
  </RaffleProvider>;
}
