import type { ReactNode } from 'react';
import { Check } from '@/components/fan-ui/fan-icons';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanActivityStamp, type FanActivityStampKind } from '@/components/fan-ui/fan-activity-stamp';
import { FanDisplay } from '@/components/fan-ui/fan-display';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { FanIcon } from '@/components/fan-ui/fan-icon';
import { FanSurface } from '@/components/fan-ui/fan-surface';
import type { AppLocale } from '@/i18n/locales';
import { raffleNextStepsText } from '@/i18n/catalogs/raffle-next-steps';
import styles from './raffle.module.css';

export type RaffleNextStep = 'pick' | 'attend' | 'invite';

type Props = {
  locale: AppLocale;
  /** 서버가 센 값: Fan Passport를 받았는지 · 오늘 출석했는지 · 초대로 응모한 친구 수 · 이어서 출석한 날 수 · 다음 날이 열리는 시각(밀리초) */
  passport: boolean; attendedToday: boolean; friends?: number; streak?: number; nextDayAt?: number;
  /** 마감 시각과 `D-17` 같은 남은 날 표시(없으면 줄에서 뺀다) */
  closesAt: number; dday?: string;
  hrefs: { pick: string; attend: string };
  /** status: 초대로 응모한 친구가 있을 때의 한 줄(서버 값) · error: 공유가 안 됐을 때의 오류 줄 */
  invite: { onShare: () => void; disabled: boolean; label: string; status?: string; error?: string };
  onStep: (step: RaffleNextStep) => void;
  /** 알림 동의 한 줄(내일 다시 올 길). 응모 결과가 서버에서 오기 전에는 없다 */
  children?: ReactNode;
};

/** 다음 날이 열리는 시각을 사용자 시간대로: 요일 + 시:분. */
export function raffleOpensAt(locale: AppLocale, time: number) {
  try { return new Intl.DateTimeFormat(locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(time)); }
  catch { return new Intl.DateTimeFormat('en', { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(time)); }
}

/**
 * 응모 직후 '오늘 기회 늘리기' 3단계(GROWTH-ONBOARD-RETAIN-1128): 최애 고르기 +1 · 오늘 출석 +1 · 친구 초대 +3.
 * 끝낸 단계는 체크, 아직인 첫 단계의 버튼만 primary(화면의 다음 한 가지 행동). 아래에는 '내일 다시 오면'을 숫자로(연속 출석·열리는 시각·D-day).
 * 출석은 최애의 Fan Passport가 있어야 해서 최애 고르기가 먼저다.
 */
export function RaffleNextSteps({ locale, passport, attendedToday, friends, streak, nextDayAt, closesAt, dday, hrefs, invite, onStep, children }: Props) {
  const t = (key: Parameters<typeof raffleNextStepsText>[1], values?: Record<string, string | number>) => raffleNextStepsText(locale, key, values);
  const invited = (friends ?? 0) > 0;
  const rows = [
    { step: 'pick', stamp: 'passport', label: t('pick'), plus: '+1', done: passport },
    { step: 'attend', stamp: 'attendance', label: t('attend'), plus: '+1', done: attendedToday },
    { step: 'invite', stamp: 'invite', label: t('invite'), plus: '+3', done: invited },
  ] as const satisfies readonly { step: RaffleNextStep; stamp: FanActivityStampKind; label: string; plus: string; done: boolean }[];
  const first = rows.find(row => !row.done)?.step;
  const doneCount = rows.filter(row => row.done).length;
  const variant = (step: RaffleNextStep) => (step === first ? 'primary' : 'neutral') as 'primary' | 'neutral';
  // 마지막 날에는 '내일'이 없다
  const tomorrow = nextDayAt !== undefined && nextDayAt <= closesAt;
  return <FanSurface as="div" className={styles.next} data-raffle-next>
    <div className={styles.nextHead}>
      <FanHeading as="h3"><FanDisplay role="heading">{t('title')}</FanDisplay></FanHeading>
      <FanDisplay role="strong" className={styles.nextCount} data-raffle-next-count>{doneCount}/{rows.length}</FanDisplay>
    </div>
    <ul className={styles.nextRows}>{rows.map(row => <li key={row.step} data-row="raffle-next" data-step={row.step} data-done={row.done || undefined}>
      <FanActivityStamp kind={row.stamp} size="sm" />
      <div className={styles.bonusRowText}>
        <p className={styles.bonusName}><FanDisplay role="lead">{row.label}</FanDisplay><FanDisplay role="lead" className={styles.plus}>{row.plus}</FanDisplay></p>
        {row.step === 'invite' && invite.status ? <FanDisplay role="caption" as="p" className={styles.muted} data-raffle-next-friends>{invite.status}</FanDisplay> : null}
      </div>
      {row.step === 'invite'
        ? <span className={styles.nextAction}>
            <FanAction type="button" variant={variant('invite')} size="sm" disabled={invite.disabled} onClick={() => { onStep('invite'); invite.onShare(); }}>{invite.label}</FanAction>
          </span>
        : row.done
          ? <FanDisplay role="caption" as="p" className={styles.doneMark} data-done-mark><FanIcon icon={Check} size={16} className={styles.doneCheck} />{t('done')}</FanDisplay>
          : <span className={styles.nextAction}>
              <FanAction href={row.step === 'pick' ? hrefs.pick : hrefs.attend} variant={variant(row.step)} size="sm" onClick={() => onStep(row.step)}>{t(row.step === 'pick' ? 'pickDo' : 'attendDo')}</FanAction>
            </span>}
    </li>)}</ul>
    {invite.error ? <p className={styles.inviteError} role="alert"><FanDisplay role="caption">{invite.error}</FanDisplay></p> : null}
    {tomorrow && <div className={styles.tomorrow} data-raffle-tomorrow>
      <FanDisplay role="strong" as="p">{t('tomorrow')}</FanDisplay>
      <p className={styles.tomorrowFacts}>
        {streak ? <FanDisplay role="caption" data-raffle-streak={streak}>{t('streak', { n: streak })}</FanDisplay> : null}
        <FanDisplay role="caption" data-raffle-opens>{t('opens', { time: raffleOpensAt(locale, nextDayAt) })}</FanDisplay>
        {dday ? <FanDisplay role="caption" data-raffle-dday>{dday}</FanDisplay> : null}
      </p>
    </div>}
    {children}
  </FanSurface>;
}
