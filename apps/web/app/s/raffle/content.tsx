import type { AppLocale } from '@/i18n/locales';
import { signupRaffleText } from '@/i18n/catalogs/signup-raffle';
import { raffleLongformText, type SignupRaffleLongformKey } from '@/i18n/catalogs/signup-raffle-longform';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { FanDisplay } from '@/components/fan-ui/fan-display';
import { FanPrintDesk, FanPrintGiftCard } from '@/components/fan-ui/fan-print';
import { FanActivityStamp } from '@/components/fan-ui/fan-activity-stamp';
import { FanPrintReveal } from '@/components/fan-ui/fan-print-reveal';
import { FanSurface } from '@/components/fan-ui/fan-surface';
import { signupEvent } from '@/features/benefit/domain/signup-event';
import { RaffleCardFloat } from '@/features/raffle-cards/card-float';
import { RaffleBoostAction, RaffleEnterBlock, RaffleInvitedFriends, RaffleMoreAction, RaffleOdds, RaffleProvider, RaffleStickyCta, RaffleCountdown, type RafflePreview } from './participation';
import styles from './raffle.module.css';

const art = (name: string) => `/images/raffle/v4/${name}.webp`;
/** 소품에 찍는 인쇄 문구. 실제 인쇄물처럼 언어와 상관없이 같은 글자다. */
const print = { giftCard: 'GIFT CARD', giftNote: 'KYAA RAFFLE 2026' } as const;
/** 당첨 확률 올리기 행: 기회가 붙는 행동 전부(응모만 필수, 사용자 결정 2026-11-13). 행 이름 옆에 몇 회가 붙는지, 아래 줄에 조건.
 * 덕질 행동마다 같은 잉크 스탬프 그림을 붙인다(DESIGN.md 4절). */
const boosts = [
  { kind: 'passport', stamp: 'passport', label: 'bonusPassport', plus: 'plusOne', facts: ['bonusOnce'] },
  { kind: 'community', stamp: 'community', label: 'bonusCommunity', plus: 'plusOne', facts: ['bonusOnce'] },
  { kind: 'comment', stamp: 'comment', label: 'bonusComment', plus: 'plusOne', facts: ['bonusLimit'] },
  { kind: 'attend', stamp: 'attendance', label: 'bonusAttend', plus: 'plusOne', facts: ['bonusLimit'] },
  { kind: 'invite', stamp: 'invite', label: 'bonusInvite', plus: 'plusThree', facts: ['bonusInviteRule'] },
] as const;

export function RaffleContent({ locale, closesAt, now, closed, preview, invite }: { locale: AppLocale; closesAt: number; now: number; closed: boolean; preview?: RafflePreview; invite?: string }) {
  const text = (key: Parameters<typeof signupRaffleText>[1], count?: number) => signupRaffleText(locale, key, count);
  const t = (key: SignupRaffleLongformKey, count?: number) => raffleLongformText(locale, key, count);
  return <RaffleProvider locale={locale} closed={closed} closesAt={closesAt} now={now} preview={preview} invite={invite}>
    {/* v5.2 상세페이지 흐름: 키 비주얼(무슨 이벤트·얼마·몇 명·언제까지) → 경품 카드 | 참여 방법(필수) → 당첨 확률 올리기 → 더 즐기기(선택) → 안내. 응모 버튼은 하단 고정 줄로 늘 보인다 */}
    <FanPrintDesk className={styles.keyVisual} src={art('key-visual-tall')} wideSrc={art('key-visual-wide')} wideFrom="48rem" width={1131} height={1391} eager>
      {/* 왼쪽 정렬로 쌓이는 줄은 모두 optical: 첫 글자 잉크가 같은 세로선에서 시작한다(DESIGN.md 7-2 큰 글자 줄 왼쪽 광학 정렬) */}
      <header className={styles.keyText}>
        <FanHeading as="h1"><FanDisplay role="title" optical>{text('title')}</FanDisplay>{' '}<FanDisplay role="figure" optical>{t('eventKind')}</FanDisplay></FanHeading>
        {/* 총액·총인원은 이 화면에 여기 한 번(테스트로 고정) */}
        <p className={styles.keyFacts}><FanDisplay role="lead" optical>US$400</FanDisplay><FanDisplay role="lead">{t('giftCard')}</FanDisplay><FanDisplay role="lead">{t('totalWinners')}</FanDisplay></p>
        <FanDisplay role="strong" as="p" optical>{t('period')}</FanDisplay>
        <RaffleCountdown hero />
      </header>
    </FanPrintDesk>

    <div className={styles.body}>
      {/* 경품: 카드 네 묶음은 three.js로 떠 있다(준비 전·대체 상태는 같은 자리의 DOM 카드). 금액은 카드에, 인원은 카드 아래에 */}
      <section className={styles.prize} data-block="raffle-prize" aria-labelledby="raffle-prize">
        <div className={styles.sectionHead}><FanHeading as="h2" id="raffle-prize"><FanDisplay role="heading">{t('prizes')}</FanDisplay></FanHeading></div>
        <FanPrintDesk className={styles.prizeDesk} src={art('prize-desk-tall')} wideSrc={art('prize-desk-wide')} wideFrom="48rem" width={1122} height={1402}>
          <FanPrintReveal as="ol" inView="stack" label={t('prizes')} className={styles.prizes}>{signupEvent.prizes.map((prize, order) => <li key={prize.usd} data-row="raffle-prize" data-tier={prize.usd}>
            <FanPrintGiftCard label={print.giftCard} amount={`US$${prize.usd}`} note={print.giftNote} count={prize.quantity} envelope={prize.usd === 100} material={art(`mat-card-${prize.usd}`)} order={order} />
            <FanDisplay role="strong" as="p">{text('prizeCount', prize.quantity)}</FanDisplay>
          </li>)}</FanPrintReveal>
          <RaffleCardFloat />
        </FanPrintDesk>
      </section>

      {/* 참여 방법(필수): 응모 버튼 + 친구에게 공유(보조 버튼) + 마감까지 남은 시간(1초마다) + 1인 1응모. 응모하면 이 자리에 도장이 찍힌다 */}
      <section className={styles.section} data-block="raffle-enter" aria-labelledby="raffle-enter">
        <div className={styles.sectionHead}>
          <FanHeading as="h2" id="raffle-enter"><FanDisplay role="heading">{t('how')}</FanDisplay></FanHeading>
          <FanDisplay role="caption" as="p" className={styles.muted}>{t('required')}</FanDisplay>
        </div>
        <RaffleEnterBlock />
      </section>

      {/* 당첨 확률 올리기: 페이지에서 하나뿐인 옅은 분홍 면. 행마다 그 행동의 스탬프 그림 */}
      <FanSurface tone="focus" className={styles.bonus} data-block="raffle-bonus" aria-labelledby="raffle-bonus">
        <FanHeading as="h2" id="raffle-bonus"><FanDisplay role="heading">{t('bonusTitle')}</FanDisplay></FanHeading>
        <RaffleOdds />
        <ul className={styles.bonusRows}>{boosts.map(row => <li key={row.kind} data-row="raffle-bonus" data-kind={row.kind}>
          <FanActivityStamp kind={row.stamp} />
          <div className={styles.bonusRowText}>
            <p className={styles.bonusName}><FanDisplay role="lead">{t(row.label)}</FanDisplay><FanDisplay role="lead" className={styles.plus} data-raffle-plus>{t(row.plus)}</FanDisplay></p>
            <p className={styles.bonusFacts}>{row.facts.map(key => <FanDisplay key={key} role="caption">{t(key)}</FanDisplay>)}{row.kind === 'invite' ? <RaffleInvitedFriends /> : null}</p>
          </div>
          {row.kind === 'passport' || row.kind === 'community' ? <RaffleMoreAction kind={row.kind} short /> : <RaffleBoostAction kind={row.kind} />}
        </li>)}</ul>
      </FanSurface>

      {/* 더 즐기기(선택): 면 없이 선으로만 나눈 낮은 두 행. 그림은 그 행동의 스탬프. 기회 값(+1)은 당첨 확률 올리기에만 둔다(같은 숫자 두 번 금지, 감독 2026-11-13) */}
      <section className={styles.section} data-block="raffle-more" aria-labelledby="raffle-more">
        <div className={styles.sectionHead}>
          <FanHeading as="h2" id="raffle-more"><FanDisplay role="heading">{t('more')}</FanDisplay></FanHeading>
          <FanDisplay role="caption" as="p" className={styles.muted}>{t('optional')}</FanDisplay>
        </div>
        <ul className={styles.more}>
          <li data-row="raffle-more">
            <FanActivityStamp kind="passport" size="lg" />
            <FanDisplay role="strong" as="p">{t('passportTitle')}</FanDisplay>
            <RaffleMoreAction kind="passport" />
          </li>
          <li data-row="raffle-more">
            <FanActivityStamp kind="community" size="lg" />
            <FanDisplay role="strong" as="p">{t('communityTitle')}</FanDisplay>
            <RaffleMoreAction kind="community" />
          </li>
        </ul>
      </section>

      <section className={styles.foot} data-block="raffle-foot" aria-labelledby="raffle-notice">
        <div className={styles.sectionHead}>
          <FanHeading as="h2" id="raffle-notice"><FanDisplay role="heading">{t('notice')}</FanDisplay></FanHeading>
        </div>
        <ul className={styles.notice}>{(['notice1', 'notice2', 'notice3', 'notice9', 'notice8', 'notice4', 'notice5', 'notice6', 'notice7'] as const).map(key => <li key={key} data-row="raffle-terms"><FanDisplay role="caption">{t(key)}</FanDisplay></li>)}</ul>
      </section>
    </div>
    <RaffleStickyCta />
  </RaffleProvider>;
}
