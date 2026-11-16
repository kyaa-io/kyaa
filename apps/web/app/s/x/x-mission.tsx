'use client';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { FanAction } from '@/components/fan-ui/fan-action';
import { FanHeading } from '@/components/fan-ui/fan-heading';
import { FanText } from '@/components/fan-ui/fan-text';
import { FanDisplay } from '@/components/fan-ui/fan-display';
import { FanContentContainer } from '@/components/fan-shell/fan-content-container';
import { Star, Check } from '@/components/fan-ui/fan-icons';
import { useLikeMission } from './use-like-mission';
import styles from './x-mission.module.css';
/** 단계 아이콘: 기존 3D 애셋(확성기 = 이벤트, 문 = 로그인). 좋아요 단계는 애셋 대신 좋아요 버튼과 같은 별 아이콘(대표 11/15 17:02: 좋아요는 별, 하트는 찐팬 하트) */
const loginStepArt = ['/images/my/shortcuts/reports.webp', '/images/my/shortcuts/logout.webp'] as const;
export const missionSlug = 'x-mission-1113';
const stampArt = '/images/stamps/ink-v1/first-like.webp';
export type MissionCopy = { title: string; subtitle: string; how: string; once: string; stamped: string; event: string; steps: readonly [string, string, string]; login: string; like: string; done: string; count: string; error: string; retry: string; saveError: string };
/** 좋아요 한 번 = 참여 한 건인 이벤트 화면. slug는 이벤트용 페이지(celebrities) 행, path는 이 화면 주소(로그인 뒤 돌아올 곳). */
export type LikeMissionConfig = {
 slug: string; path: string; copy: Record<'ko' | 'en', MissionCopy>;
 /** 끝낸 단계 표시. 'login': 접속·로그인을 이 화면이 확인한다. 'like': 앞 단계는 X에서 하므로 확인할 수 없어 좋아요 전에는 체크하지 않는다(서버 화면에서 넘기므로 값으로 둔다) */
 progress: 'login' | 'like';
 /** KoL 유입 기록의 중복 방지 키 앞부분 */
 attributionKey: string;
 /** 앞 두 단계 그림(셋째 좋아요 단계는 별). 없으면 확성기·문(접속·로그인) */
 stepArt?: readonly [string, string];
};
export const xLikeMission: LikeMissionConfig = {
 slug: missionSlug, path: '/s/x', attributionKey: 'x-mission',
 progress: 'login',
 copy: {
  ko: { title: '좋아요 미션', subtitle: 'Like Mission', how: '참여 방법', once: '1인 1회', stamped: '도장 쾅! 좋아요 미션 완료', event: 'KYAA × X 좋아요 미션', steps: ['이벤트 페이지 접속', 'Google로 로그인', '좋아요 누르기'], login: 'Google로 로그인', like: '좋아요', done: '미션 완료', count: '좋아요', error: '이벤트를 불러오지 못했어요. 다시 시도해 주세요.', retry: '다시 시도', saveError: '좋아요를 저장하지 못했어요. 다시 시도해 주세요.' },
  en: { title: 'Like Mission', subtitle: '좋아요 미션', how: 'How to join', once: 'Once per account', stamped: 'Stamped! Mission complete', event: 'KYAA × X Like Mission', steps: ['Visit this event page', 'Sign in with Google', 'Like this page'], login: 'Continue with Google', like: 'Like', done: 'Mission complete', count: 'Likes', error: 'Couldn’t load the event. Please try again.', retry: 'Try again', saveError: 'Couldn’t save your like. Please try again.' },
 },
};
export function XMission({ locale, mission = xLikeMission }: { locale: 'ko' | 'en'; mission?: LikeMissionConfig }) {
 const auth = useByUsAuth();
 return <MissionForOwner key={`${mission.slug}:${auth.ready}:${auth.authenticated}:${auth.user?.id ?? 'guest'}`} locale={locale} auth={auth} mission={mission} />;
}
function MissionForOwner({ locale, auth, mission }: { locale: 'ko' | 'en'; auth: ReturnType<typeof useByUsAuth>; mission: LikeMissionConfig }) {
 const t = mission.copy[locale];
 const stepArt = mission.stepArt ?? loginStepArt;
 const { ready, authenticated, loaded, completed, celebrate, pending, error, count, nickname, stampDate, inX, browserNotice, loginHref, like, beginLogin, openBrowser, languageHref, retryLoad } = useLikeMission({ locale, auth, slug: mission.slug, path: mission.path, attributionKey: mission.attributionKey });
 const primary = 'primary' as const;
 const doneSteps = completed ? 3 : mission.progress === 'like' ? 0 : authenticated ? 2 : 1;
 return <FanContentContainer as="main" id="x-mission-main" className={styles.column} lang={locale}>
  <div className={styles.hero}>
   {completed ? <section className={styles.proof} data-block="x-mission-stamp" data-celebrate={celebrate ? '' : undefined} aria-labelledby="x-mission-stamped">
    <img className={styles.wordmark} src="/images/guest-home/kyaa-wordmark.svg" alt="kyaa" width={1164} height={563} />
    <FanDisplay role="caption">{t.event}</FanDisplay>
    <img className={styles.stamp} src={stampArt} alt="" width={512} height={512} decoding="async" />
    <FanHeading as="h2" id="x-mission-stamped"><FanDisplay role="title">{t.stamped}</FanDisplay></FanHeading>
    <p className={styles.proofFacts}>{nickname ? <FanDisplay role="strong" dir="auto">{nickname}</FanDisplay> : null}<FanDisplay role="strong">{stampDate}</FanDisplay></p>
   </section> : <div className={styles.keyVisual}><img src="/images/x-mission/key-visual.webp" alt="" width={1536} height={1024} fetchPriority="high" decoding="async" /></div>}
   <div className={styles.panel}>
    <div className={styles.topRow}>
     <header className={styles.title}>
      <FanDisplay role="caption" className={styles.muted}>KYAA × X</FanDisplay>
      <FanHeading as="h1"><FanDisplay role="title" optical>{t.title}</FanDisplay></FanHeading>
      <FanDisplay role="lead" as="p" className={styles.muted} lang={locale === 'ko' ? 'en' : 'ko'}>{t.subtitle}</FanDisplay>
     </header>
     <nav className={styles.languages} aria-label="Language"><a href={languageHref('en')} lang="en" aria-current={locale === 'en' ? 'page' : undefined}>EN</a><a href={languageHref('ko')} lang="ko" aria-current={locale === 'ko' ? 'page' : undefined}>한국어</a></nav>
    </div>
    {inX && <div className={styles.browser}><FanAction onClick={openBrowser} fullWidth>{locale === 'ko' ? '브라우저로 열기' : 'Open in browser'}</FanAction>{browserNotice && <FanText as="p" role="body">{locale === 'ko' ? 'X 메뉴에서 ‘브라우저에서 열기’를 선택해 주세요.' : 'Choose “Open in browser” from the X menu.'}</FanText>}</div>}
    <section className={styles.mission} data-block="x-mission" aria-labelledby="x-mission-how">
     <div className={styles.sectionHead}>
      <div className={styles.headTitle}><FanHeading as="h2" id="x-mission-how"><FanDisplay role="heading">{t.how}</FanDisplay></FanHeading><FanDisplay role="caption" className={styles.muted}>{t.once}</FanDisplay></div>
      <FanDisplay role="strong" as="p" className={styles.progressText}><span className={styles.accent}>{doneSteps}</span> / 3</FanDisplay>
     </div>
     <div className={styles.progress} aria-hidden="true">{[0, 1, 2].map(index => <span key={index} data-done={index < doneSteps ? '' : undefined} />)}</div>
     <ol className={styles.steps}>{t.steps.map((step, index) => { const done = index < doneSteps; return <li data-row="mission-step" key={step} data-done={done ? '' : undefined} aria-current={!completed && index === doneSteps ? 'step' : undefined}>
      {index < stepArt.length ? <img className={styles.stepArt} src={stepArt[index]} alt="" width={48} height={48} loading="lazy" decoding="async" /> : <span className={`${styles.stepArt} ${styles.stepStar}`} aria-hidden="true"><Star size={32} strokeWidth={1.5} /></span>}
      <span className={styles.stepText}><FanDisplay role="caption" className={styles.stepNo}>0{index + 1}</FanDisplay><FanDisplay role="strong">{step}</FanDisplay></span>
      {done ? <Check className={styles.check} size={20} strokeWidth={1.5} aria-hidden="true" /> : <span className={styles.todo} aria-hidden="true" />}
     </li>; })}</ol>
     {error && <FanText as="p" role="body" aria-live="assertive">{error === 'load' ? t.error : t.saveError}</FanText>}
     <div className={styles.cta}>{error === 'load' ? <FanAction onClick={retryLoad} fullWidth>{t.retry}</FanAction> : !authenticated ? <FanAction href={loginHref} onClick={beginLogin} variant={primary} fullWidth>{t.login}</FanAction> : <FanAction onClick={like} variant={primary} fullWidth disabled={!ready || !loaded || completed || pending} loading={pending} leadingIcon={<Star className={celebrate ? styles.pop : undefined} size={20} strokeWidth={1.5} fill={completed ? 'currentColor' : 'none'} />}>{completed ? t.done : t.like}</FanAction>}</div>
     <div className={styles.result} role="status" aria-live="polite" data-celebrate={celebrate ? '' : undefined}>
      {count ? <FanDisplay role="caption" as="p" className={styles.count}><Star size={16} strokeWidth={1.5} aria-hidden="true" />{t.count} · {new Intl.NumberFormat(locale).format(count)}</FanDisplay> : null}
     </div>
    </section>
   </div>
  </div>
 </FanContentContainer>;
}
