import type { AppLocale } from '@/i18n/locales';
export const challengeBadge: Record<AppLocale, string> = {
 ko: '찐팬 100', en: '100 True Fans', ja: '本命ファン100', 'zh-Hans': '真爱粉100', 'zh-Hant': '真愛粉100',
 es: '100 fans fieles', id: '100 fan sejati', vi: '100 fan ruột', th: 'แฟนตัวจริง 100', pt: '100 fãs fiéis', fr: '100 vrais fans', ru: '100 преданных фанатов',
};
const values:Record<AppLocale,readonly string[]>={
 ko:['팬페이지와 모임 찾기','관심 있는 아티스트·취미·브랜드를 검색해 보세요.','한강에서 함께 달려요','같이 달리고 러닝 기록을 나눠요.','러닝 모임 보기','오늘의 출석','기본순'],
 en:['Find fan pages and groups','Search for artists, hobbies and brands you like.','Run together by the Han River','Run together and share your records.','Explore running groups','Today’s check-in','Default order'],
 ja:['ファンページとグループを探す','好きなアーティスト・趣味・ブランドを検索。','漢江で一緒に走ろう','一緒に走って記録をシェアしましょう。','ランニンググループを見る','今日の出席','標準順'],
 'zh-Hans':['寻找粉丝页和群组','搜索你感兴趣的艺人、爱好和品牌。','一起在汉江跑步','一起跑步，分享跑步记录。','查看跑步群组','今日签到','默认排序'],
 'zh-Hant':['尋找粉絲頁和群組','搜尋你感興趣的藝人、興趣和品牌。','一起在漢江跑步','一起跑步，分享跑步紀錄。','查看跑步群組','今日簽到','預設排序'],
 es:['Encuentra páginas y grupos','Busca artistas, aficiones y marcas que te interesen.','Corre junto al río Han','Corre en compañía y comparte tus registros.','Ver grupos de running','Registro de hoy','Orden predeterminado'],
 id:['Temukan halaman dan grup','Cari artis, hobi, dan merek yang Anda sukai.','Berlari bersama di Sungai Han','Berlari bersama dan bagikan catatan Anda.','Lihat grup lari','Presensi hari ini','Urutan bawaan'],
 vi:['Tìm trang người hâm mộ và nhóm','Tìm nghệ sĩ, sở thích và thương hiệu bạn quan tâm.','Cùng chạy bên sông Hàn','Cùng chạy và chia sẻ thành tích.','Xem nhóm chạy bộ','Điểm danh hôm nay','Thứ tự mặc định'],
 th:['ค้นหาแฟนเพจและกลุ่ม','ค้นหาศิลปิน งานอดิเรก และแบรนด์ที่สนใจ','วิ่งด้วยกันที่แม่น้ำฮัน','วิ่งด้วยกันและแบ่งปันบันทึกการวิ่ง','ดูกลุ่มวิ่ง','เช็กอินวันนี้','ลำดับเริ่มต้น'],
 pt:['Encontre páginas e grupos','Pesquise artistas, hobbies e marcas que você gosta.','Corra junto ao rio Han','Corra em grupo e compartilhe seus registros.','Ver grupos de corrida','Presença de hoje','Ordem padrão'],
 fr:['Trouver des pages et des groupes','Recherchez des artistes, loisirs et marques.','Courir ensemble au bord du Han','Courez ensemble et partagez vos parcours.','Voir les groupes de course','Présence du jour','Ordre par défaut'],
 ru:['Найти фан-страницы и группы','Ищите любимых артистов, увлечения и бренды.','Бегайте вместе у реки Хан','Бегайте вместе и делитесь результатами.','Группы для бега','Отметка за сегодня','По умолчанию'],
};
export function discoveryCopy(locale:AppLocale){const v=values[locale];return {title:v[0],intro:v[1],heroTitle:v[2],heroBody:v[3],heroAction:v[4],attendance:v[5],defaultSort:v[6]};}
