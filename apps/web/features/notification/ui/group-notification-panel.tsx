'use client';
import Link from 'next/link';
import type {Route} from 'next';
import type {AppLocale} from '@/i18n/locales';
import {TranslatedText} from '@/features/content-safety/ui/use-automatic-translation';
import styles from './group-notification-panel.module.css';
export type GroupNotificationRow={id:string;label:string;actionLabel:string;href:string};
const copy:Record<AppLocale,readonly [string,string]>={ko:['알림','댓글·신고·인증·추첨·수령 알림을 확인하세요.'],en:['Notifications','Check comments, reports, verification, raffle and receipt updates.'],ja:['通知','コメント・通報・認証・抽選・受取の通知をご確認ください。'],'zh-Hans':['通知','查看评论、举报、认证、抽奖和领取通知。'],'zh-Hant':['通知','查看留言、檢舉、認證、抽獎和領取通知。'],es:['Notificaciones','Consulta novedades de comentarios, reportes, verificación, sorteos y recepción.'],id:['Notifikasi','Lihat pembaruan komentar, laporan, verifikasi, undian dan penerimaan.'],vi:['Thông báo','Xem thông báo bình luận, báo cáo, xác minh, bốc thăm và nhận quà.'],th:['การแจ้งเตือน','ตรวจสอบการแจ้งเตือนความคิดเห็น รายงาน การยืนยัน การจับรางวัล และการรับของ'],pt:['Notificações','Veja atualizações de comentários, denúncias, verificação, sorteios e recebimento.'],fr:['Notifications','Consultez commentaires, signalements, vérifications, tirages et réceptions.'],ru:['Уведомления','Проверяйте комментарии, жалобы, подтверждения, розыгрыши и получение.']};
export function GroupNotificationPanel({locale,rows,onOpen,emptyLabel}:{locale:AppLocale;rows:readonly GroupNotificationRow[];onOpen?:(id:string)=>void;emptyLabel?:string}){
 const t=copy[locale];
 return <section className={styles.panel} aria-labelledby='group-notification-title'><h1 id='group-notification-title'>{t[0]}</h1><p>{t[1]}</p><ul>{rows.map(row=><li key={row.id}><span><TranslatedText text={row.label} locale={locale} controls={false}/></span><Link href={row.href as Route} onClick={event=>{if(!onOpen||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();onOpen(row.id);}}><TranslatedText text={row.actionLabel} locale={locale} controls={false}/></Link></li>)}</ul>{!rows.length&&emptyLabel&&<p role='status'>{emptyLabel}</p>}</section>;
}
