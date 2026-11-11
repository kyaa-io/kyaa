import type { AppLocale } from "@/i18n/locales";

/** 모임 상단 세 블록(내 아티스트·Hot 게시글·얇은 배너) 문구. 번호 자리표시는 {0}. */
const values: Record<AppLocale, readonly string[]> = {
  ko: ["내 아티스트", "모임 찾기", "로그인", "Hot 게시글", "좋아요순", "펼치기", "접기", "아직 Hot 게시글 없음", "게시글을 불러오지 못했어요", "다시 시도", "좋아요 {0}", "댓글 {0}", "모임 배너", "이전 배너", "다음 배너"],
  en: ["My artists", "Find groups", "Sign in", "Hot posts", "Most liked", "Show more", "Show less", "No hot posts yet", "Couldn’t load posts", "Retry", "{0} likes", "{0} comments", "Group banners", "Previous banner", "Next banner"],
  ja: ["マイアーティスト", "グループを探す", "ログイン", "Hot投稿", "いいね順", "もっと見る", "閉じる", "Hot投稿はまだありません", "投稿を読み込めませんでした", "再試行", "いいね {0}", "コメント {0}", "グループのバナー", "前のバナー", "次のバナー"],
  "zh-Hans": ["我的艺人", "查找群组", "登录", "热门帖子", "按点赞数排序", "展开", "收起", "暂无热门帖子", "无法加载帖子", "重试", "点赞 {0}", "评论 {0}", "群组横幅", "上一个横幅", "下一个横幅"],
  "zh-Hant": ["我的藝人", "尋找群組", "登入", "熱門貼文", "依按讚數排序", "展開", "收合", "目前沒有熱門貼文", "無法載入貼文", "重試", "按讚 {0}", "留言 {0}", "群組橫幅", "上一個橫幅", "下一個橫幅"],
  es: ["Mis artistas", "Buscar grupos", "Iniciar sesión", "Publicaciones Hot", "Más me gusta", "Ver más", "Ver menos", "Aún no hay publicaciones Hot", "No se pudieron cargar las publicaciones", "Reintentar", "{0} me gusta", "{0} comentarios", "Banners de grupos", "Banner anterior", "Banner siguiente"],
  id: ["Artis saya", "Cari grup", "Masuk", "Postingan Hot", "Paling banyak disukai", "Lihat semua", "Ciutkan", "Belum ada postingan Hot", "Tidak dapat memuat postingan", "Coba lagi", "{0} suka", "{0} komentar", "Banner grup", "Banner sebelumnya", "Banner berikutnya"],
  vi: ["Nghệ sĩ của tôi", "Tìm nhóm", "Đăng nhập", "Bài viết Hot", "Nhiều lượt thích nhất", "Mở rộng", "Thu gọn", "Chưa có bài viết Hot", "Không tải được bài viết", "Thử lại", "{0} lượt thích", "{0} bình luận", "Banner nhóm", "Banner trước", "Banner sau"],
  th: ["ศิลปินของฉัน", "ค้นหากลุ่ม", "เข้าสู่ระบบ", "โพสต์ Hot", "ถูกใจมากที่สุด", "ดูเพิ่ม", "ย่อ", "ยังไม่มีโพสต์ Hot", "โหลดโพสต์ไม่สำเร็จ", "ลองอีกครั้ง", "ถูกใจ {0}", "ความคิดเห็น {0}", "แบนเนอร์กลุ่ม", "แบนเนอร์ก่อนหน้า", "แบนเนอร์ถัดไป"],
  pt: ["Meus artistas", "Encontrar grupos", "Entrar", "Publicações Hot", "Mais curtidas", "Ver mais", "Ver menos", "Ainda não há publicações Hot", "Não foi possível carregar as publicações", "Tentar de novo", "{0} curtidas", "{0} comentários", "Banners de grupos", "Banner anterior", "Próximo banner"],
  fr: ["Mes artistes", "Trouver des groupes", "Se connecter", "Publications Hot", "Les plus aimées", "Voir plus", "Voir moins", "Aucune publication Hot pour l’instant", "Impossible de charger les publications", "Réessayer", "{0} j’aime", "{0} commentaires", "Bannières des groupes", "Bannière précédente", "Bannière suivante"],
  ru: ["Мои артисты", "Найти группы", "Войти", "Популярные записи", "Больше всего лайков", "Развернуть", "Свернуть", "Пока нет популярных записей", "Не удалось загрузить записи", "Повторить", "Лайков: {0}", "Комментариев: {0}", "Баннеры групп", "Предыдущий баннер", "Следующий баннер"],
};

const hotSort: Record<AppLocale, readonly [string, string, string]> = {
  ko: ["댓글순", "조회수순", "최신순"], en: ["Most commented", "Most viewed", "Latest"], ja: ["コメント順", "閲覧数順", "新着順"],
  "zh-Hans": ["按评论数排序", "按浏览量排序", "按最新排序"], "zh-Hant": ["依留言數排序", "依瀏覽數排序", "依最新排序"],
  es: ["Más comentarios", "Más vistas", "Más recientes"], id: ["Komentar terbanyak", "Penayangan terbanyak", "Terbaru"],
  vi: ["Nhiều bình luận nhất", "Nhiều lượt xem nhất", "Mới nhất"], th: ["ความคิดเห็นมากที่สุด", "ยอดดูมากที่สุด", "ใหม่ล่าสุด"],
  pt: ["Mais comentários", "Mais visualizações", "Mais recentes"], fr: ["Les plus commentées", "Les plus vues", "Les plus récentes"], ru: ["Больше всего комментариев", "Больше всего просмотров", "Новые"],
};

const views: Record<AppLocale, string> = {
  ko: "조회 {0}", en: "{0} views", ja: "閲覧 {0}", "zh-Hans": "浏览 {0}", "zh-Hant": "瀏覽 {0}",
  es: "{0} vistas", id: "{0} tayangan", vi: "{0} lượt xem", th: "{0} ครั้งที่ดู", pt: "{0} visualizações", fr: "{0} vues", ru: "Просмотров: {0}",
};

export function directoryTopCopy(locale: AppLocale) {
  const v = values[locale];
  const fill = (text: string, count: number) => text.replace("{0}", count.toLocaleString(locale));
  return {
    myArtists: v[0]!, findGroups: v[1]!, signIn: v[2]!, hotTitle: v[3]!, hotSub: v[4]!, hotSort: { likes: v[4]!, comments: hotSort[locale][0], views: hotSort[locale][1], latest: hotSort[locale][2] }, expand: v[5]!, collapse: v[6]!, hotEmpty: v[7]!, hotError: v[8]!, retry: v[9]!,
    likes: (count: number) => fill(v[10]!, count), comments: (count: number) => fill(v[11]!, count), views: (count: number) => fill(views[locale], count), bannerLabel: v[12]!, previousBanner: v[13]!, nextBanner: v[14]!,
  };
}
