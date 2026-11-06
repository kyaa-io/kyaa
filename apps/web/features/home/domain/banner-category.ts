import type { AppLocale } from '@/i18n/locales';
import type { HomeBanner } from './home-banner';
const labels:Record<AppLocale,readonly[string,string,string,string,string,string]>={
 ko:['이벤트','모임','팬페이지','소식','LIVE','안내'],en:['Event','Group','Fan page','News','LIVE','Guide'],ja:['イベント','グループ','ファンページ','お知らせ','LIVE','ガイド'],
 'zh-Hans':['活动','群组','粉丝页','消息','LIVE','指南'],'zh-Hant':['活動','群組','粉絲頁','消息','LIVE','指南'],es:['Evento','Grupo','Página de fans','Noticias','LIVE','Guía'],
 id:['Acara','Grup','Halaman penggemar','Berita','LIVE','Panduan'],vi:['Sự kiện','Nhóm','Trang người hâm mộ','Tin tức','LIVE','Hướng dẫn'],th:['กิจกรรม','กลุ่ม','หน้าแฟน','ข่าวสาร','LIVE','คู่มือ'],
 pt:['Evento','Grupo','Página de fãs','Notícias','LIVE','Guia'],fr:['Événement','Groupe','Page de fans','Actualités','LIVE','Guide'],ru:['Событие','Группа','Фан-страница','Новости','LIVE','Руководство'],
};
export function bannerCategoryLabel(category:NonNullable<HomeBanner['category']>,locale:AppLocale){return labels[locale][['event','group','fanpage','announcement','live','guide'].indexOf(category)];}
