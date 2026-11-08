"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Coins, Heart, Star } from 'lucide-react';
import { Menu } from '@base-ui/react/menu';
import type { Route } from 'next';
import { FanIcon } from '@/components/fan-ui/fan-icon';
import { APP_LOCALE_NATIVE_NAMES, type AppLocale } from '@/i18n/locales';
import { useByUsAuth } from '@/features/auth/client/cognito-auth';
import { useSelectedBias } from '@/features/selected-bias/ui/use-selected-bias';
import { gradeOf } from '@/features/selected-bias/ui/selected-bias-chip';
import { rememberOverlayTrigger } from '@/components/ui/overlay/focus-return';
import { walletSchema } from '@/server/group-wallet/domain';
import { useAvatar } from '@/features/profile/ui/use-avatar';
import { Avatar, AvatarPlaceholder } from '@/features/profile/ui/avatar';
import { GroupLanguageDialog } from './group-language-dialog';
import { GROUP_WALLET_CHANGED_EVENT, useGroupRequest, useGroupResource } from './use-group-resource';
import styles from './group-header-account.module.css';

const parse = (value: unknown) => walletSchema.parse(value);

/** Menu words (ko·en here, the other languages read the English until the catalog carries them — same as the 4차 menu). */
const words = (locale: AppLocale) => locale === 'ko'
  ? { menu: '계정 메뉴', passport: '패스포트', friends: '친구·메시지', settings: '설정', language: '언어', openPage: '팬페이지 개설', logout: '로그아웃', choose: '최애 고르기', hearts: (n: string, name: string) => `${name} 하트 ${n}`, points: (n: string) => `포인트 ${n}` }
  : { menu: 'Account menu', passport: 'Passport', friends: 'Friends · Messages', settings: 'Settings', language: 'Language', openPage: 'Open a fan page', logout: 'Sign out', choose: 'Choose a favorite', hearts: (n: string, name: string) => `${n} hearts for ${name}`, points: (n: string) => `${n} points` };

/** First row (5차 B2, K10): my state in one line — tier · favorite ♥N · P N ›, to the 덕질 tab. Without a favorite: ☆ 최애 고르기 · P N.
 * The values leave the header (8장 / 2.1) and live here and in the 덕질 wallet. While a value is unknown its place stays empty, never a dash. */
function StatusRow({ locale }: { locale: AppLocale }) {
  const auth = useGroupRequest(), wallet = useGroupResource(auth.authenticated ? '/api/me/wallet' : null, parse), bias = useSelectedBias(locale), w = words(locale);
  const refreshWallet = wallet.retry;
  useEffect(() => { const refresh = () => refreshWallet(); window.addEventListener(GROUP_WALLET_CHANGED_EVENT, refresh); return () => window.removeEventListener(GROUP_WALLET_CHANGED_EVENT, refresh); }, [refreshWallet]);
  const favorite = bias.selected, points = wallet.data?.points;
  const pointsCell = points === undefined ? null : <span className={styles.statusCell} data-metric="asset" aria-label={w.points(points.toLocaleString(locale))}>
    <FanIcon icon={Coins} size={16} /><span aria-hidden="true">P {points.toLocaleString(locale)}</span></span>;
  const dot = <span className={styles.statusDot} aria-hidden="true">·</span>;
  const content: ReactNode = favorite
    ? <>
        <span className={styles.statusGrade}>{gradeOf(locale, favorite)}</span>{dot}
        <span className={styles.statusName}>{favorite.name}</span>
        <span className={styles.statusCell} data-metric="asset" aria-label={w.hearts((favorite.hearts ?? 0).toLocaleString(locale), favorite.name)}>
          <FanIcon icon={Heart} size={16} filled className={styles.heart} /><span aria-hidden="true">{(favorite.hearts ?? 0).toLocaleString(locale)}</span>
        </span>
        {pointsCell ? <>{dot}{pointsCell}</> : null}
      </>
    : <>
        <FanIcon icon={Star} size={16} /><span className={styles.statusName}>{w.choose}</span>
        {pointsCell ? <>{dot}{pointsCell}</> : null}
      </>;
  const href = favorite || bias.status !== 'empty' ? `/benefits?locale=${locale}` : `/pages/groups?locale=${locale}`;
  return <Menu.Item className={`${styles.menuItem} ${styles.statusRow}`} data-row="menu" data-menu-status="" render={<Link href={href as Route} />}>
    <span className={styles.statusLine} data-meta="">{content}</span><FanIcon icon={ChevronRight} size={16} className={styles.chevron} />
  </Menu.Item>;
}

/** Account menu (5차 B2): the avatar opens eight 48px rows — my state · MY · 패스포트 · 친구·메시지 · 설정 · 언어 · 팬페이지 개설 · 로그아웃.
 * Shown only signed in (signed out the header has a 로그인 word instead). */
export function GroupHeaderAccount({ locale, actions, actionsAreIdentity = false, languageHref }: { locale: AppLocale; actions?: ReactNode; actionsAreIdentity?: boolean; languageHref: string }) {
  const auth = useGroupRequest(), avatar = useAvatar(), { logout } = useByUsAuth(), router = useRouter(), w = words(locale);
  const [languageOpen, setLanguageOpen] = useState(false), trigger = useRef<HTMLButtonElement>(null);
  const [leaving, setLeaving] = useState(false);
  const signOut = async () => { if (leaving) return; setLeaving(true); try { await logout(); router.replace(`/login?locale=${locale}` as Route); } catch { setLeaving(false); } };
  if (!auth.authenticated) return null;
  const links: readonly { href: string; label: string }[] = [
    { href: '/my', label: 'MY' }, { href: '/passports', label: w.passport }, { href: '/my/friends', label: w.friends }, { href: '/settings', label: w.settings },
  ];
  const go = <FanIcon icon={ChevronRight} size={16} className={styles.chevron} />;
  return <>
    {!actionsAreIdentity && actions}
    <Menu.Root>
      <Menu.Trigger ref={trigger} className={styles.avatarTrigger} data-account-trigger="avatar" aria-label={w.menu}>
        {avatar.state.status === 'ready' ? <Avatar avatar={avatar.state.avatar} imageUrl={avatar.state.imageUrl} label='' size={32} /> : <AvatarPlaceholder size={32} />}
      </Menu.Trigger>
      <Menu.Portal><Menu.Positioner className={styles.positioner} sideOffset={8} align='end' collisionPadding={16}><Menu.Popup className={styles.menu} aria-label={w.menu} data-fan-menu="">
        <StatusRow locale={locale} />
        {links.map(({ href, label }) => <Menu.Item key={href} className={styles.menuItem} data-row="menu" render={<Link href={`${href}?locale=${locale}` as Route} />}><span className={styles.label}>{label}</span>{go}</Menu.Item>)}
        <Menu.Item className={styles.menuItem} data-row="menu" onClick={() => { if (trigger.current) rememberOverlayTrigger(trigger.current); setLanguageOpen(true); }}>
          <span className={styles.label}>{w.language}</span><span className={styles.value}>{APP_LOCALE_NATIVE_NAMES[locale]}</span><FanIcon icon={ChevronDown} size={16} className={styles.chevron} />
        </Menu.Item>
        <Menu.Item className={styles.menuItem} data-row="menu" render={<Link href={`/pages/groups/apply?locale=${locale}` as Route} />}><span className={styles.label}>{w.openPage}</span>{go}</Menu.Item>
        <Menu.Item className={`${styles.menuItem} ${styles.divided}`} data-row="menu" disabled={leaving} onClick={() => void signOut()}><span className={styles.label}>{w.logout}</span></Menu.Item>
      </Menu.Popup></Menu.Positioner></Menu.Portal>
    </Menu.Root>
    {languageOpen && <GroupLanguageDialog locale={locale} href={languageHref} onClose={() => setLanguageOpen(false)} />}
  </>;
}
