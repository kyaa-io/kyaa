import type { AppLocale } from '@/i18n/locales';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';
import { raffleLongformText, type SignupRaffleLongformKey } from '@/i18n/catalogs/signup-raffle-longform';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { FanDisplay } from '@/components/fan-ui/fan-display';
import { FanPrintDesk, FanPrintGiftCard, FanPrintPassport } from '@/components/fan-ui/fan-print';
import { FanPrintReveal } from '@/components/fan-ui/fan-print-reveal';
import { FanSurface } from '@/components/fan-ui/fan-surface';
import { signupEvent } from '@/features/benefit/domain/signup-event';
import { RaffleBoostAction, RaffleHeroAction, RaffleMoreAction, RaffleProvider, RaffleShare, RaffleStickyCta, type RafflePreview } from './participation';
import styles from './raffle.module.css';

const art = (name: string) => `/images/raffle/v4/${name}.webp`;
/** 소품에 찍는 인쇄 문구. 실제 인쇄물처럼 언어와 상관없이 같은 글자다. */
const print = { giftCard: 'GIFT CARD', giftNote: 'KYAA RAFFLE 2026', passport: 'FAN PASSPORT', passportCode: ['P<KYAA<FAN<PASSPORT<<<<<<<<<<<<<<<<', 'KYAA2611<<FAN<ARCHIVE<<<<<<<<<<<<<<'] } as const;

export function RaffleContent({ locale, daysLeft, closed, preview }: { locale: AppLocale; daysLeft: number; closed: boolean; preview?: RafflePreview }) {
  const text = (key: Parameters<typeof signupRaffleText>[1], count?: number) => signupRaffleText(locale, key, count);
  const t = (key: SignupRaffleLongformKey, count?: number) => raffleLongformText(locale, key, count);
  const left = daysLeft <= 0 ? t('lastDay') : t('daysLeft', daysLeft);
  return <RaffleProvider locale={locale} closed={closed} preview={preview}>
    {/* 1 총액 → 2 응모 버튼(마감·1인 1응모) → 3 경품 카드 네 묶음. 총액·총인원은 이 구역에만 한 번 */}
    <header className={styles.hero}>
      <div className={styles.heroText}>
        <div className={styles.heroTop}>
          <FanHeading as="h1"><FanDisplay role="heading">{text('title')}</FanDisplay></FanHeading>
          {closed ? null : <FanDisplay role="strong" as="p" className={styles.dday} data-urgent={daysLeft <= 1}>{left}</FanDisplay>}
        </div>
        <p className={styles.amount}><FanDisplay role="figure-sm">{t('total')}</FanDisplay><FanDisplay role="amount">US$400</FanDisplay></p>
        <p className={styles.heroFacts}><FanDisplay role="title">{t('giftCard')}</FanDisplay><FanDisplay role="title">{t('totalWinners')}</FanDisplay></p>
        <div className={styles.heroAction} data-raffle-hero-action>
          <p className={styles.heroDeadline}><FanDisplay role="strong">{t('closesAt')}</FanDisplay><FanDisplay role="caption" className={styles.muted}>{t('kst')}</FanDisplay></p>
          <RaffleHeroAction />
        </div>
      </div>
      <FanPrintDesk className={styles.prizeDesk} src={art('prize-desk-tall')} width={1122} height={1402} eager>
        <FanPrintReveal as="ol" inView="stack" label={t('prizes')} className={styles.prizes}>{signupEvent.prizes.map((prize, order) => <li key={prize.usd} data-row="raffle-prize" data-tier={prize.usd}>
          <FanPrintGiftCard label={print.giftCard} amount={`US$${prize.usd}`} note={print.giftNote} count={prize.quantity} envelope={prize.usd === 100} material={art(`mat-card-${prize.usd}`)} order={order} />
          <FanDisplay role="strong" as="p">{text('prizeCount', prize.quantity)}</FanDisplay>
        </li>)}</FanPrintReveal>
      </FanPrintDesk>
    </header>

    <div className={styles.body}>
      {/* 4 당첨 기회 올리기: 페이지에서 하나뿐인 옅은 분홍 면 */}
      <FanSurface tone="focus" className={styles.bonus} data-block="raffle-bonus" aria-labelledby="raffle-bonus">
        <FanHeading as="h2" id="raffle-bonus"><FanDisplay role="heading">{t('bonusTitle')}</FanDisplay></FanHeading>
        <ul className={styles.bonusRows}>{(['comment', 'attend'] as const).map(kind => <li key={kind} data-row="raffle-bonus">
          <div className={styles.bonusRowText}>
            <FanDisplay role="lead" as="p">{t(kind === 'comment' ? 'bonusComment' : 'bonusAttend')}</FanDisplay>
            <p className={styles.bonusFacts}><FanDisplay role="caption">{t('bonusRate')}</FanDisplay><FanDisplay role="caption">{t('bonusLimit')}</FanDisplay></p>
          </div>
          <RaffleBoostAction kind={kind} />
        </li>)}</ul>
      </FanSurface>

      {/* 5 더 즐기기(선택): 면 없이 선으로만 나눈 낮은 두 행 */}
      <section className={styles.section} data-block="raffle-more" aria-labelledby="raffle-more">
        <div className={styles.sectionHead}>
          <FanHeading as="h2" id="raffle-more"><FanDisplay role="heading">{t('more')}</FanDisplay></FanHeading>
          <FanDisplay role="caption" as="p" className={styles.muted}>{t('optional')}</FanDisplay>
        </div>
        <ul className={styles.more}>
          <li data-row="raffle-more">
            <FanPrintDesk className={styles.moreArt} src={art('step-desk-pen')} width={1448} height={1086}>
              <FanPrintPassport className={styles.morePassport} title={print.passport} caption={t('passportTitle')} code={print.passportCode} stamps={['attendance', 'first-comment', 'membership', 'share']} />
            </FanPrintDesk>
            <FanDisplay role="strong" as="p">{t('passportTitle')}</FanDisplay>
            <RaffleMoreAction kind="passport" />
          </li>
          <li data-row="raffle-more">
            <FanPrintDesk className={styles.moreArt} src={art('step-community')} width={600} height={600} />
            <FanDisplay role="strong" as="p">{t('communityTitle')}</FanDisplay>
            <RaffleMoreAction kind="community" />
          </li>
        </ul>
      </section>

      <section className={styles.foot} data-block="raffle-foot" aria-labelledby="raffle-notice">
        <div className={styles.sectionHead}>
          <FanHeading as="h2" id="raffle-notice"><FanDisplay role="heading">{t('notice')}</FanDisplay></FanHeading>
          <RaffleShare />
        </div>
        <ul className={styles.notice}>{(['notice1', 'notice2', 'notice3', 'notice8', 'notice4', 'notice5', 'notice6', 'notice7'] as const).map(key => <li key={key} data-row="raffle-terms"><FanDisplay role="caption">{t(key)}</FanDisplay></li>)}</ul>
      </section>
    </div>
    <RaffleStickyCta />
  </RaffleProvider>;
}
