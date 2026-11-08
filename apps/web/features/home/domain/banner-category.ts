import type { AppLocale } from '@/i18n/locales';
import type { HomeBanner } from './home-banner';
const labels:Record<AppLocale,readonly[string,string,string,string,string,string,string]>={
 ko:['이벤트','모임','팬페이지','소식','LIVE','안내','광고'],en:['Event','Group','Fan page','News','LIVE','Guide','Ad'],ja:['イベント','グループ','ファンページ','お知らせ','LIVE','ガイド','広告'],
 'zh-Hans':['活动','群组','粉丝页','消息','LIVE','指南','广告'],'zh-Hant':['活動','群組','粉絲頁','消息','LIVE','指南','廣告'],es:['Evento','Grupo','Página de fans','Noticias','LIVE','Guía','Anuncio'],
 id:['Acara','Grup','Halaman penggemar','Berita','LIVE','Panduan','Iklan'],vi:['Sự kiện','Nhóm','Trang người hâm mộ','Tin tức','LIVE','Hướng dẫn','Quảng cáo'],th:['กิจกรรม','กลุ่ม','หน้าแฟน','ข่าวสาร','LIVE','คู่มือ','โฆษณา'],
 pt:['Evento','Grupo','Página de fãs','Notícias','LIVE','Guia','Anúncio'],fr:['Événement','Groupe','Page de fans','Actualités','LIVE','Guide','Publicité'],ru:['Событие','Группа','Фан-страница','Новости','LIVE','Руководство','Реклама'],
};
export function bannerCategoryLabel(category:NonNullable<HomeBanner['category']>,locale:AppLocale){return labels[locale][['event','group','fanpage','announcement','live','guide','ad'].indexOf(category)];}
