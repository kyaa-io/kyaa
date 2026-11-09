import { z } from "zod";
import type { AppLocale } from "@/i18n/locales";

/** kyaa's own notices (home_notices, plan R8-DATA §3). Everything published is public; there is no visibility or post type. */
export const homeNoticeCategories = ["guide", "creator", "event", "update"] as const;
export type HomeNoticeCategory = (typeof homeNoticeCategories)[number];

export const homeNoticeSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.enum(homeNoticeCategories),
  pinned: z.boolean(),
  publishedAt: z.string().min(1),
  title: z.string().min(1).max(160),
  /** The linked fan page (creator handle) while it is still published and listed; otherwise the row opens the notice detail. */
  linkHref: z.string().regex(/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
}).strict();
export type HomeNoticeSummary = z.infer<typeof homeNoticeSummarySchema>;

export const homeNoticePageSchema = z.object({
  items: z.array(homeNoticeSummarySchema).max(20),
  hasMore: z.boolean(),
}).strict();

export type HomeNoticePage = Readonly<{ items: readonly HomeNoticeSummary[]; nextCursor: string | null }>;

export const homeNoticeCategoryLabels: Record<AppLocale, Record<HomeNoticeCategory, string>> = {
  ko: { guide: "안내", creator: "크리에이터", event: "이벤트", update: "업데이트" },
  en: { guide: "Guide", creator: "Creators", event: "Event", update: "Update" },
  ja: { guide: "ご案内", creator: "クリエイター", event: "イベント", update: "アップデート" },
  "zh-Hans": { guide: "指南", creator: "创作者", event: "活动", update: "更新" },
  "zh-Hant": { guide: "指南", creator: "創作者", event: "活動", update: "更新" },
  es: { guide: "Guía", creator: "Creadores", event: "Evento", update: "Novedad" },
  id: { guide: "Panduan", creator: "Kreator", event: "Acara", update: "Pembaruan" },
  vi: { guide: "Hướng dẫn", creator: "Nhà sáng tạo", event: "Sự kiện", update: "Cập nhật" },
  th: { guide: "คู่มือ", creator: "ครีเอเตอร์", event: "กิจกรรม", update: "อัปเดต" },
  pt: { guide: "Guia", creator: "Criadores", event: "Evento", update: "Novidade" },
  fr: { guide: "Guide", creator: "Créateurs", event: "Événement", update: "Mise à jour" },
  ru: { guide: "Справка", creator: "Авторы", event: "Событие", update: "Обновление" },
};

/** Error codes the home notice admin route answers with; the admin screen shows the matching message. */
export const homeNoticeErrorCodes = ["SLUG_TAKEN", "NOT_FOUND", "REVISION_CONFLICT", "INCOMPLETE", "STATE_CONFLICT", "INVALID_BODY", "LINK_INVALID", "UNAVAILABLE"] as const;
export type HomeNoticeErrorCode = (typeof homeNoticeErrorCodes)[number];

export const homeNoticeErrorMessages: Record<AppLocale, Record<HomeNoticeErrorCode, string>> = {
  ko: {
    SLUG_TAKEN: "이미 다른 공지가 쓰는 주소 이름이에요. 주소 이름을 바꿔 저장해 주세요.",
    NOT_FOUND: "이 공지를 찾지 못했어요. 목록을 새로 불러와 주세요.",
    REVISION_CONFLICT: "다른 관리자가 먼저 바꾼 공지예요. 최신 상태를 불러온 뒤 다시 해 주세요.",
    INCOMPLETE: "한국어와 영어의 제목·본문을 모두 채워야 공개할 수 있어요.",
    STATE_CONFLICT: "공개 중인 공지는 공개를 멈춘 뒤 고칠 수 있고, 보관한 공지는 바꿀 수 없어요.",
    INVALID_BODY: "본문에 넣을 수 없는 이미지나 서식이 있어요. 비공개 이미지는 홈 공지에 쓸 수 없어요.",
    LINK_INVALID: "이 팬페이지는 지금 공개 중이 아니거나 목록에 없어 연결할 수 없어요. 다른 팬페이지를 고르거나 연결을 빼 주세요.",
    UNAVAILABLE: "공지를 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  },
  en: {
    SLUG_TAKEN: "Another notice already uses this URL name. Change the URL name and save again.",
    NOT_FOUND: "This notice could not be found. Reload the list.",
    REVISION_CONFLICT: "Another admin changed this notice first. Load the latest state and try again.",
    INCOMPLETE: "Fill in the Korean and English title and body before publishing.",
    STATE_CONFLICT: "Unpublish a published notice before editing it. Archived notices cannot be changed.",
    INVALID_BODY: "The body has an image or format that cannot be used. Private images are not allowed in home notices.",
    LINK_INVALID: "This fan page is not published or not listed right now, so it cannot be linked. Pick another fan page or remove the link.",
    UNAVAILABLE: "The notice could not be processed. Try again in a moment.",
  },
  ja: {
    SLUG_TAKEN: "このURL名はほかのお知らせで使われています。URL名を変えて保存してください。",
    NOT_FOUND: "このお知らせが見つかりません。一覧を読み込み直してください。",
    REVISION_CONFLICT: "ほかの管理者が先に変更しました。最新の状態を読み込んでからやり直してください。",
    INCOMPLETE: "公開するには韓国語と英語のタイトル・本文をすべて入力してください。",
    STATE_CONFLICT: "公開中のお知らせは公開を止めてから編集できます。保管したお知らせは変更できません。",
    INVALID_BODY: "本文に使えない画像や書式があります。非公開の画像はホームのお知らせに使えません。",
    LINK_INVALID: "このファンページは現在公開されていないか一覧にないため、リンクできません。別のファンページを選ぶか、リンクを外してください。",
    UNAVAILABLE: "お知らせを処理できませんでした。しばらくしてからもう一度お試しください。",
  },
  "zh-Hans": {
    SLUG_TAKEN: "其他公告已使用此网址名称。请更改网址名称后再保存。",
    NOT_FOUND: "找不到此公告。请重新加载列表。",
    REVISION_CONFLICT: "其他管理员已先修改此公告。请加载最新状态后重试。",
    INCOMPLETE: "需填写韩语和英语的标题与正文后才能发布。",
    STATE_CONFLICT: "已发布的公告需先取消发布才能修改，已归档的公告无法更改。",
    INVALID_BODY: "正文中有无法使用的图片或格式。首页公告不能使用非公开图片。",
    LINK_INVALID: "此粉丝页面目前未公开或未列出，无法关联。请选择其他粉丝页面或取消关联。",
    UNAVAILABLE: "无法处理此公告。请稍后再试。",
  },
  "zh-Hant": {
    SLUG_TAKEN: "其他公告已使用此網址名稱。請更改網址名稱後再儲存。",
    NOT_FOUND: "找不到此公告。請重新載入列表。",
    REVISION_CONFLICT: "其他管理員已先修改此公告。請載入最新狀態後再試一次。",
    INCOMPLETE: "需填寫韓文和英文的標題與內文後才能發布。",
    STATE_CONFLICT: "已發布的公告需先取消發布才能修改，已封存的公告無法變更。",
    INVALID_BODY: "內文中有無法使用的圖片或格式。首頁公告不能使用非公開圖片。",
    LINK_INVALID: "此粉絲頁面目前未公開或未列出，無法連結。請選擇其他粉絲頁面或取消連結。",
    UNAVAILABLE: "無法處理此公告。請稍後再試。",
  },
  es: {
    SLUG_TAKEN: "Otro aviso ya usa este nombre de URL. Cámbialo y guarda de nuevo.",
    NOT_FOUND: "No se encontró este aviso. Vuelve a cargar la lista.",
    REVISION_CONFLICT: "Otro administrador cambió este aviso antes. Carga el estado más reciente y vuelve a intentarlo.",
    INCOMPLETE: "Completa el título y el cuerpo en coreano e inglés antes de publicar.",
    STATE_CONFLICT: "Despublica un aviso publicado antes de editarlo. Los avisos archivados no se pueden cambiar.",
    INVALID_BODY: "El cuerpo tiene una imagen o un formato que no se puede usar. Las imágenes privadas no se permiten en los avisos de inicio.",
    LINK_INVALID: "Esta página de fans no está publicada o no aparece en la lista ahora, así que no se puede vincular. Elige otra o quita el vínculo.",
    UNAVAILABLE: "No se pudo procesar el aviso. Inténtalo de nuevo en un momento.",
  },
  id: {
    SLUG_TAKEN: "Nama URL ini sudah dipakai pengumuman lain. Ganti nama URL lalu simpan lagi.",
    NOT_FOUND: "Pengumuman ini tidak ditemukan. Muat ulang daftarnya.",
    REVISION_CONFLICT: "Admin lain sudah mengubah pengumuman ini lebih dulu. Muat status terbaru lalu coba lagi.",
    INCOMPLETE: "Isi judul dan isi dalam bahasa Korea dan Inggris sebelum menerbitkan.",
    STATE_CONFLICT: "Batalkan penerbitan pengumuman sebelum mengeditnya. Pengumuman yang diarsipkan tidak bisa diubah.",
    INVALID_BODY: "Isi memuat gambar atau format yang tidak bisa dipakai. Gambar privat tidak boleh ada di pengumuman beranda.",
    LINK_INVALID: "Halaman penggemar ini sedang tidak terbit atau tidak tercantum, jadi tidak bisa ditautkan. Pilih halaman lain atau hapus tautannya.",
    UNAVAILABLE: "Pengumuman tidak bisa diproses. Coba lagi sebentar lagi.",
  },
  vi: {
    SLUG_TAKEN: "Tên URL này đã được thông báo khác sử dụng. Hãy đổi tên URL rồi lưu lại.",
    NOT_FOUND: "Không tìm thấy thông báo này. Hãy tải lại danh sách.",
    REVISION_CONFLICT: "Quản trị viên khác đã sửa thông báo này trước. Hãy tải trạng thái mới nhất rồi thử lại.",
    INCOMPLETE: "Hãy điền đủ tiêu đề và nội dung tiếng Hàn và tiếng Anh trước khi đăng.",
    STATE_CONFLICT: "Hãy gỡ đăng thông báo trước khi sửa. Thông báo đã lưu trữ không thể thay đổi.",
    INVALID_BODY: "Nội dung có hình ảnh hoặc định dạng không dùng được. Không được dùng ảnh riêng tư trong thông báo trang chủ.",
    LINK_INVALID: "Trang fan này hiện không được công khai hoặc không có trong danh sách nên không thể liên kết. Hãy chọn trang khác hoặc bỏ liên kết.",
    UNAVAILABLE: "Không xử lý được thông báo. Hãy thử lại sau ít phút.",
  },
  th: {
    SLUG_TAKEN: "ชื่อ URL นี้มีประกาศอื่นใช้แล้ว เปลี่ยนชื่อ URL แล้วบันทึกอีกครั้ง",
    NOT_FOUND: "ไม่พบประกาศนี้ โหลดรายการใหม่อีกครั้ง",
    REVISION_CONFLICT: "ผู้ดูแลคนอื่นแก้ไขประกาศนี้ก่อนแล้ว โหลดสถานะล่าสุดแล้วลองอีกครั้ง",
    INCOMPLETE: "กรอกชื่อและเนื้อหาภาษาเกาหลีและภาษาอังกฤษให้ครบก่อนเผยแพร่",
    STATE_CONFLICT: "ยกเลิกการเผยแพร่ก่อนแก้ไขประกาศ ประกาศที่เก็บถาวรแล้วแก้ไขไม่ได้",
    INVALID_BODY: "เนื้อหามีรูปภาพหรือรูปแบบที่ใช้ไม่ได้ ห้ามใช้รูปภาพส่วนตัวในประกาศหน้าแรก",
    LINK_INVALID: "หน้าแฟนนี้ยังไม่เผยแพร่หรือไม่อยู่ในรายการ จึงลิงก์ไม่ได้ เลือกหน้าแฟนอื่นหรือนำลิงก์ออก",
    UNAVAILABLE: "ดำเนินการกับประกาศไม่ได้ ลองอีกครั้งในอีกสักครู่",
  },
  pt: {
    SLUG_TAKEN: "Outro aviso já usa este nome de URL. Troque o nome de URL e salve de novo.",
    NOT_FOUND: "Este aviso não foi encontrado. Recarregue a lista.",
    REVISION_CONFLICT: "Outro administrador alterou este aviso antes. Carregue o estado mais recente e tente de novo.",
    INCOMPLETE: "Preencha o título e o corpo em coreano e inglês antes de publicar.",
    STATE_CONFLICT: "Despublique um aviso publicado antes de editá-lo. Avisos arquivados não podem ser alterados.",
    INVALID_BODY: "O corpo tem uma imagem ou um formato que não pode ser usado. Imagens privadas não são permitidas nos avisos da página inicial.",
    LINK_INVALID: "Esta página de fãs não está publicada ou não aparece na lista agora, então não pode ser vinculada. Escolha outra ou remova o vínculo.",
    UNAVAILABLE: "Não foi possível processar o aviso. Tente de novo em instantes.",
  },
  fr: {
    SLUG_TAKEN: "Une autre annonce utilise déjà ce nom d’URL. Changez-le puis enregistrez à nouveau.",
    NOT_FOUND: "Cette annonce est introuvable. Rechargez la liste.",
    REVISION_CONFLICT: "Un autre administrateur a modifié cette annonce avant vous. Chargez l’état le plus récent puis réessayez.",
    INCOMPLETE: "Remplissez le titre et le texte en coréen et en anglais avant de publier.",
    STATE_CONFLICT: "Dépubliez une annonce publiée avant de la modifier. Une annonce archivée ne peut pas être modifiée.",
    INVALID_BODY: "Le texte contient une image ou une mise en forme non autorisée. Les images privées sont interdites dans les annonces d’accueil.",
    LINK_INVALID: "Cette page de fans n’est pas publiée ou pas listée pour l’instant, elle ne peut donc pas être liée. Choisissez-en une autre ou retirez le lien.",
    UNAVAILABLE: "L’annonce n’a pas pu être traitée. Réessayez dans un instant.",
  },
  ru: {
    SLUG_TAKEN: "Это имя URL уже занято другим объявлением. Измените имя URL и сохраните снова.",
    NOT_FOUND: "Объявление не найдено. Обновите список.",
    REVISION_CONFLICT: "Другой администратор уже изменил это объявление. Загрузите последнюю версию и повторите.",
    INCOMPLETE: "Перед публикацией заполните заголовок и текст на корейском и английском.",
    STATE_CONFLICT: "Снимите объявление с публикации, чтобы его изменить. Архивные объявления изменить нельзя.",
    INVALID_BODY: "В тексте есть недопустимое изображение или форматирование. Закрытые изображения нельзя использовать в объявлениях на главной.",
    LINK_INVALID: "Эта фан-страница сейчас не опубликована или не показана в списке, поэтому её нельзя привязать. Выберите другую или уберите привязку.",
    UNAVAILABLE: "Не удалось обработать объявление. Повторите попытку чуть позже.",
  },
};
