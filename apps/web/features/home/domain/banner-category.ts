import type { AppLocale } from '@/i18n/locales';
import type { HomeBanner } from './home-banner';
const labels:Record<AppLocale,readonly[string,string,string,string,string]>={
 ko:['이벤트','모임','팬페이지','소식','LIVE'],en:['Event','Group','Fan page','News','LIVE'],ja:['イベント','グループ','ファンページ','お知らせ','LIVE'],
 'zh-Hans':['活动','群组','粉丝页','消息','LIVE'],'zh-Hant':['活動','群組','粉絲頁','消息','LIVE'],es:['Evento','Grupo','Página de fans','Noticias','LIVE'],
 id:['Acara','Grup','Halaman penggemar','Berita','LIVE'],vi:['Sự kiện','Nhóm','Trang người hâm mộ','Tin tức','LIVE'],th:['กิจกรรม','กลุ่ม','หน้าแฟน','ข่าวสาร','LIVE'],
 pt:['Evento','Grupo','Página de fãs','Notícias','LIVE'],fr:['Événement','Groupe','Page de fans','Actualités','LIVE'],ru:['Событие','Группа','Фан-страница','Новости','LIVE'],
};
export function bannerCategoryLabel(category:NonNullable<HomeBanner['category']>,locale:AppLocale){return labels[locale][['event','group','fanpage','announcement','live'].indexOf(category)];}
