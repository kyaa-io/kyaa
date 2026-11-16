'use client';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { FanText } from '@/components/fan-ui/fan-text';
import { FanDisplay } from '@/components/fan-ui/fan-display';
import { FanContentContainer } from '@/components/fan-shell/fan-content-container';
import { Star, Check } from '@/components/fan-ui/fan-icons';
import { useLikeMission } from '../s/x/use-like-mission';
import xs from '../s/x/x-mission.module.css';
import { followPostIntent, followXHandle, type FollowEventConfig } from './follow-event';
import { GleamWidget } from './gleam-widget';
import styles from './follow-mission.module.css';

/** X 팔로우 = 확성기, 리포스트 = 말풍선(기존 3D 애셋) */
const xArt = ['/images/my/shortcuts/reports.webp', '/images/my/shortcuts/friends.webp'] as const;
const stampArt = '/images/stamps/ink-v1/first-like.webp';

/**
 * 이벤트 1 화면(사용자 11/16: '덕질하는 법'처럼 번호 붙은 미션 카드). 01·02 X 미션 카드 안에 Gleam 위젯(완료 체크는 Gleam이 띄운다),
 * 03 kyaa 좋아요 카드(서버 기록 = 체크 + 도장). 두 카드가 붙어 있어 체크 3개가 캡처 한 장에 든다. kyaa는 Gleam 완료를 판정하지 않는다.
 */
export function FollowMission({ locale, event }: { locale: 'ko' | 'en'; event: FollowEventConfig }) {
 const auth = useByUsAuth();
 return <FollowMissionForOwner key={`${event.slug}:${auth.ready}:${auth.authenticated}:${auth.user?.id ?? 'guest'}`} locale={locale} auth={auth} event={event} />;
}

function FollowMissionForOwner({ locale, auth, event }: { locale: 'ko' | 'en'; auth: ReturnType<typeof useByUsAuth>; event: FollowEventConfig }) {
 const t = event.copy[locale];
 const m = useLikeMission({ locale, auth, slug: event.slug, path: event.path, attributionKey: event.attributionKey, scrollOnComplete: false });
 // 버튼은 한 번에 하나만 보인다(로그인 → 좋아요 → X에 올리기). 강조 버튼은 화면에 늘 하나
 const primary = 'primary' as const;
 const action = m.error === 'load'
  ? <FanAction onClick={m.retryLoad} fullWidth>{t.retry}</FanAction>
  : !m.authenticated
   ? <FanAction href={m.loginHref} onClick={m.beginLogin} variant={primary} fullWidth>{t.login}</FanAction>
   : m.completed
    ? <FanAction href={followPostIntent(locale)} external variant={primary} fullWidth>{t.post}</FanAction>
    : <FanAction onClick={m.like} variant={primary} fullWidth disabled={!m.ready || !m.loaded || m.pending} loading={m.pending} leadingIcon={<Star size={20} strokeWidth={1.5} />}>{t.like}</FanAction>;
 return <FanContentContainer as="main" id="x-mission-main" className={xs.column} lang={locale}>
  <div className={xs.hero}>
   <div className={`${xs.keyVisual} ${styles.visual}`}><img src="/images/x-mission/key-visual.webp" alt="" width={1536} height={1024} fetchPriority="high" decoding="async" /></div>
   <div className={xs.panel}>
    <div className={xs.topRow}>
     <header className={xs.title}>
      <FanDisplay role="caption" className={xs.muted}>KYAA × X</FanDisplay>
      <FanHeading as="h1"><FanDisplay role="title" optical>{t.title}</FanDisplay></FanHeading>
      <FanDisplay role="lead" as="p" className={xs.muted} lang={locale === 'ko' ? 'en' : 'ko'}>{t.subtitle}</FanDisplay>
     </header>
     <nav className={xs.languages} aria-label="Language"><a href={m.languageHref('en')} lang="en" aria-current={locale === 'en' ? 'page' : undefined}>EN</a><a href={m.languageHref('ko')} lang="ko" aria-current={locale === 'ko' ? 'page' : undefined}>한국어</a></nav>
    </div>
    {m.inX && <div className={xs.browser}><FanAction onClick={m.openBrowser} fullWidth>{locale === 'ko' ? '브라우저로 열기' : 'Open in browser'}</FanAction>{m.browserNotice && <FanText as="p" role="body">{locale === 'ko' ? 'X 메뉴에서 ‘브라우저에서 열기’를 선택해 주세요.' : 'Choose “Open in browser” from the X menu.'}</FanText>}</div>}
    <section className={styles.missions} data-block="follow-missions" aria-labelledby="follow-how">
     <div className={styles.head}><FanHeading as="h2" id="follow-how"><FanDisplay role="heading">{t.how}</FanDisplay></FanHeading><FanDisplay role="caption" className={xs.muted}>{t.once}</FanDisplay></div>
     <ol className={styles.cards}>
      <li className={styles.card} data-row="mission-card" data-mission="x">
       <div className={styles.cardHead}>
        <span className={styles.art} aria-hidden="true">{xArt.map(src => <img key={src} src={src} alt="" width={48} height={48} loading="lazy" decoding="async" />)}</span>
        <span className={styles.cardTitle}><FanDisplay role="caption" className={styles.no}>01 · 02</FanDisplay><FanDisplay role="strong">{t.xTitle}</FanDisplay><FanDisplay role="caption" className={xs.muted}>{followXHandle}</FanDisplay></span>
       </div>
       <GleamWidget href={event.gleam.href} title={event.gleam.title} />
      </li>
      <li className={styles.card} data-row="mission-card" data-mission="like" data-done={m.completed ? '' : undefined} data-celebrate={m.celebrate ? '' : undefined}>
       <div className={styles.cardHead}>
        {m.completed
         ? <img className={`${styles.art} ${styles.stamp}`} src={stampArt} alt="" width={512} height={512} decoding="async" />
         : <span className={`${styles.art} ${styles.star}`} aria-hidden="true"><Star size={28} strokeWidth={1.5} /></span>}
        <span className={styles.cardTitle}>
         <FanDisplay role="caption" className={styles.no}>03</FanDisplay>
         {m.completed
          ? <><FanHeading as="h3"><FanDisplay role="strong" className={styles.stamped}>{t.stamped}</FanDisplay></FanHeading><span className={styles.facts} data-block="follow-stamp">{m.nickname ? <FanDisplay role="caption" dir="auto">{m.nickname}</FanDisplay> : null}<FanDisplay role="caption">{m.stampDate}</FanDisplay></span></>
          : <><FanDisplay role="strong">{t.likeTitle}</FanDisplay>{m.count ? <FanDisplay role="caption" className={xs.muted}>{t.count} · {new Intl.NumberFormat(locale).format(m.count)}</FanDisplay> : null}</>}
        </span>
        {m.completed ? <span className={styles.check} role="img" aria-label={t.done}><Check size={20} strokeWidth={1.5} /></span> : <span className={styles.todo} aria-hidden="true" />}
       </div>
       {m.error && <FanText as="p" role="body" aria-live="assertive">{m.error === 'load' ? t.error : t.saveError}</FanText>}
       <div className={styles.cta} data-outbound-kind="social" data-outbound-placement="content">{action}</div>
      </li>
     </ol>
    </section>
   </div>
  </div>
 </FanContentContainer>;
}
