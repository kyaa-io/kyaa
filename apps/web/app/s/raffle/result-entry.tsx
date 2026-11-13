'use client';
import { useState } from 'react';
import type { AppLocale } from '@/i18n/locales';
import { raffleLongformText } from '@/i18n/catalogs/signup-raffle-longform';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanDisplay } from '@/components/fan-ui/fan-display';
import { RaffleResultCapsule, type RaffleCapsuleResult } from '@/features/capsule-machine/raffle-result-capsule';
import styles from './raffle.module.css';

/** 추첨이 끝난 뒤 응모자에게만(서버에 저장된 추첨이 있을 때): 마감 줄 + 결과 확인(마감 뒤 이 페이지의 primary 하나).
 * 누르면 캡슐 기계가 서버 결과를 꺼낸다. 응모 버튼과 같은 화면에 함께 나오지 않는다. */
export function RaffleResultEntry({ locale, result }: { locale: AppLocale; result: RaffleCapsuleResult }) {
  const [open, setOpen] = useState(false);
  const t = (key: Parameters<typeof raffleLongformText>[1], count?: number) => raffleLongformText(locale, key, count);
  const labels = { title: t('resultTitle'), won: t('resultWon', result.state === 'won' ? result.usd : 0), lost: t('resultLost'), thanks: t('resultThanks'), claim: t('resultClaim'), claimCta: t('resultClaimCta') };
  // 수령 안내 = 같은 페이지의 응모 및 당첨 안내(가입 이메일 연락·지급 방식)
  const claim = () => document.getElementById('raffle-notice')?.scrollIntoView({ block: 'start' });
  return <div className={styles.enterClosed} data-state="drawn">
    <FanDisplay role="strong" as="p" className={styles.muted}>{t('ended')}</FanDisplay>
    <div className={styles.enterCta}><FanAction type="button" variant="primary" fullWidth onClick={() => setOpen(true)}>{t('resultCta')}</FanAction></div>
    <RaffleResultCapsule open={open} onOpenChange={setOpen} result={result} locale={locale} labels={labels} onClaim={claim} />
  </div>;
}
