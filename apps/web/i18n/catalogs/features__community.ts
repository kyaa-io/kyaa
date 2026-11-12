import type { AppLocale } from "../locales";

const copy = {
  ko: ["커뮤니티", "현장에서 담은 사진부터 최애에게 전하고 싶은 이야기까지. 팬들과 함께 나눠요.", "최애 선택", "팬 게시판", "함께하는 팬", "팬 인증", "팬 요청", "팬페이지", "최근 함께한 팬", "아직 함께하는 팬이 없어요. 첫 이야기를 남겨 보세요.", "참여할 커뮤니티를 준비하고 있어요.", "명"],
  en: ["Community", "From photos you took at the venue to stories about your favorite. Share them with fellow fans.", "Choose a favorite", "Fan posts", "Fans", "Fan verification", "Fan requests", "Fan page", "Recently joined fans", "No fans here yet. Start the first conversation.", "Communities are being prepared.", " fans"],
  ja: ["コミュニティ", "現場で撮った写真も、推しへの想いも。ファン同士でシェアしましょう。", "推しを選択", "ファン掲示板", "ファン", "ファン認証", "ファンのリクエスト", "ファンページ", "最近参加したファン", "まだファンがいません。最初の投稿をしてみましょう。", "コミュニティを準備しています。", "人"],
  "zh-Hans": ["社区", "从现场拍摄的照片到关于偶像的故事，与粉丝们一起分享。", "选择艺人", "粉丝帖子", "粉丝", "真爱粉认证", "粉丝请求", "粉丝主页", "最近加入的粉丝", "还没有粉丝。来发布第一条内容吧。", "社区正在筹备中。", "人"],
  "zh-Hant": ["社群", "從現場拍攝的照片到關於偶像的故事，與粉絲們一起分享。", "選擇藝人", "粉絲貼文", "粉絲", "真愛粉認證", "粉絲請求", "粉絲主頁", "最近加入的粉絲", "還沒有粉絲。來發表第一篇貼文吧。", "社群正在籌備中。", "人"],
  es: ["Comunidad", "Comparte tus fotos de eventos e historias de tu artista favorito con otros fans.", "Elige un favorito", "Publicaciones", "Fans", "Verificación de fan", "Solicitudes", "Página de fans", "Fans recientes", "Aún no hay fans. Inicia la conversación.", "Estamos preparando las comunidades.", " fans"],
  id: ["Komunitas", "Bagikan foto dari lokasi acara dan cerita tentang favoritmu bersama penggemar lain.", "Pilih favorit", "Kiriman penggemar", "Penggemar", "Verifikasi penggemar", "Permintaan", "Halaman penggemar", "Penggemar terbaru", "Belum ada penggemar. Mulai percakapan pertama.", "Komunitas sedang disiapkan.", " penggemar"],
  vi: ["Cộng đồng", "Chia sẻ ảnh tại sự kiện và câu chuyện về thần tượng cùng người hâm mộ.", "Chọn thần tượng", "Bài đăng", "Người hâm mộ", "Xác minh fan", "Yêu cầu", "Trang người hâm mộ", "Fan mới tham gia", "Chưa có người hâm mộ. Hãy bắt đầu cuộc trò chuyện.", "Cộng đồng đang được chuẩn bị.", " người"],
  th: ["ชุมชน", "แบ่งปันภาพที่ถ่ายในงานและเรื่องราวของศิลปินที่ชอบกับแฟน ๆ", "เลือกศิลปิน", "โพสต์ของแฟน", "แฟน ๆ", "ยืนยันแฟนคลับ", "คำขอของแฟน", "แฟนเพจ", "แฟนที่เข้าร่วมล่าสุด", "ยังไม่มีแฟน เริ่มเรื่องราวแรกกันเลย", "กำลังเตรียมชุมชน", " คน"],
  pt: ["Comunidade", "Compartilhe fotos dos eventos e histórias do seu artista favorito com outros fãs.", "Escolha um favorito", "Publicações", "Fãs", "Verificação de fã", "Pedidos dos fãs", "Página de fãs", "Fãs recentes", "Ainda não há fãs. Comece a conversa.", "Estamos preparando as comunidades.", " fãs"],
  fr: ["Communauté", "Partagez vos photos prises sur place et vos histoires avec les autres fans.", "Choisir un favori", "Publications", "Fans", "Vérification de fan", "Demandes des fans", "Page de fans", "Fans récents", "Pas encore de fans. Lancez la conversation.", "Les communautés sont en préparation.", " fans"],
  ru: ["Сообщество", "От фотографий, сделанных вами на мероприятии, до историй о вашем любимом событии. Поделитесь ими с другими фанатами.", "Выберите любимый вариант", "Посты фанатов", "Фанаты", "Проверка фанатов", "Запросы фанатов", "Фан-страница", "Недавно присоединившиеся фанаты", "Здесь пока нет фанатов. Начните первую беседу.", "Населенные пункты готовятся к этому.", " фанаты"],

} satisfies Record<AppLocale, readonly string[]>;

const compactCopy = {
  "ko": [
    "핫한 커뮤니티",
    "팬 수 기준",
    "전체",
    "사진/영상만 보기"
  ],
  "en": [
    "Hot communities",
    "By fan count",
    "All",
    "Photos/videos only"
  ],
  "ja": [
    "人気のコミュニティ",
    "ファン数順",
    "すべて",
    "写真・動画のみ"
  ],
  "zh-Hans": [
    "热门社区",
    "按粉丝数排序",
    "全部",
    "只看照片和视频"
  ],
  "zh-Hant": [
    "熱門社群",
    "依粉絲數排序",
    "全部",
    "只看照片和影片"
  ],
  "es": [
    "Comunidades populares",
    "Por número de fans",
    "Todo",
    "Solo fotos y vídeos"
  ],
  "id": [
    "Komunitas populer",
    "Berdasarkan jumlah penggemar",
    "Semua",
    "Hanya foto/video"
  ],
  "vi": [
    "Cộng đồng nổi bật",
    "Theo số người hâm mộ",
    "Tất cả",
    "Chỉ ảnh/video"
  ],
  "th": [
    "ชุมชนยอดนิยม",
    "ตามจำนวนแฟน",
    "ทั้งหมด",
    "เฉพาะรูป/วิดีโอ"
  ],
  "pt": [
    "Comunidades populares",
    "Por número de fãs",
    "Tudo",
    "Só fotos/vídeos"
  ],
  "fr": [
    "Communautés populaires",
    "Par nombre de fans",
    "Tout",
    "Photos/vidéos uniquement"
  ],
  "ru": [
    "Популярные сообщества",
    "По числу фанатов",
    "Все",
    "Только фото и видео"
  ]
} satisfies Record<AppLocale, readonly string[]>;

export function communityCopy(locale: AppLocale) {
  const [title, intro, choose, posts, fans, certifications, requests, fanpage, recentFans, noFans, empty, countSuffix] = copy[locale];
  const [hot, hotBasis, allPosts, mediaOnly] = compactCopy[locale];
  return { hot, hotBasis, allPosts, mediaOnly, title, intro, choose, posts, fans, certifications, requests, fanpage, recentFans, noFans, empty, countSuffix };
}
