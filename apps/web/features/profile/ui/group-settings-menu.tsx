'use client';
import Link from 'next/link';
import type {Route} from 'next';
import {z} from 'zod';
import type {AppLocale} from '@/i18n/locales';
import {additionalLocales} from '@/i18n/messages';
import {messages} from '@/i18n/catalogs/features__profile__ui__settings-screen';
import {contentCopy} from '@/i18n/catalogs/features__fan_posts__ui';
import {accountDeletionCopy} from '@/i18n/catalogs/features__profile__ui__account-deletion';
import {presenceCopy} from '@/features/groups/ui/presence-copy';
import {useGroupRequest,useGroupResource} from '@/features/groups/ui/use-group-resource';
import type {SettingsSection} from '../domain/settings-navigation';
import styles from './group-settings-menu.module.css';
const parse=(value:unknown)=>z.object({enabled:z.boolean(),canConfigure:z.boolean()}).parse(value);
const labels={ko:{title:'설정',profile:'프로필',language:'언어',notifications:'알림',channels:'연결 및 수신 채널',account:'계정',installation:'앱 설치'},en:{title:'Settings',profile:'Profile',language:'Language',notifications:'Notifications',channels:'Connections and delivery channels',account:'Account',installation:'Install app'},...additionalLocales(locale=>({title:messages.m261b34eb8339[locale],profile:messages.mc7fba50a9917[locale],language:messages.m49802171f1bd[locale],notifications:messages.m5c5dc0a0a093[locale],channels:messages.m7b9ebb7c1094[locale],account:messages.m0f3c93ce185e[locale],installation:messages.m76dbd917d816[locale]}))};
const back:Record<AppLocale,string>={ko:'MY로 돌아가기',en:'Back to MY',ja:'MYに戻る','zh-Hans':'返回MY','zh-Hant':'返回MY',es:'Volver a MY',id:'Kembali ke MY',vi:'Về MY',th:'กลับไปยัง MY',pt:'Voltar para MY',fr:'Retour à MY',ru:'Вернуться в MY'};
const artist:Record<AppLocale,string>={ko:'아티스트 · 해당 권한에서만 표시',en:'Artist · authorized accounts only',ja:'アーティスト · 権限のあるアカウントのみ','zh-Hans':'艺人 · 仅授权账户可见','zh-Hant':'藝人 · 僅授權帳戶可見',es:'Artista · solo cuentas autorizadas',id:'Artis · hanya akun berwenang',vi:'Nghệ sĩ · chỉ tài khoản được cấp quyền',th:'ศิลปิน · เฉพาะบัญชีที่ได้รับสิทธิ์',pt:'Artista · apenas contas autorizadas',fr:'Artiste · comptes autorisés uniquement',ru:'Артист · только для авторизованных аккаунтов'};
export function GroupSettingsMenu({locale,onSelect}:{locale:AppLocale;onSelect?:(section:SettingsSection)=>void}){
 const auth=useGroupRequest(),presence=useGroupResource(auth.authenticated?'/api/groups/me/presence':null,parse),t=labels[locale];
 const rows:Record<SettingsSection,string>={profile:t.profile,language:t.language,notifications:t.notifications,channels:t.channels,account:t.account,installation:t.installation,blocked:contentCopy(locale).block,delete:accountDeletionCopy[locale].title};
 const renderGroup=(title:string,sections:SettingsSection[])=><section className={styles.group} key={title}><h2>{title}</h2>{sections.map(section=><Link id={`settings-row-${section}`} key={section} href={`/settings?locale=${locale}&section=${section}` as Route} onClick={event=>{if(!onSelect||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onSelect(section);}}>{rows[section]}</Link>)}</section>;
 return <main id='settings-content' className={styles.menu}><Link className={styles.back} href={`/my?locale=${locale}` as Route}>{back[locale]}</Link><h1>{t.title}</h1>{renderGroup(t.profile,['profile','language'])}{renderGroup(t.notifications,['notifications','channels'])}{presence.data?.canConfigure&&<section className={styles.group}><h2>{artist[locale]}</h2><Link href={`/my/presence?locale=${locale}` as Route}>{locale==='ko'?'접속 상태 공개':presenceCopy(locale).setting}</Link></section>}{renderGroup(t.account,['account','installation','blocked','delete'])}</main>;
}
