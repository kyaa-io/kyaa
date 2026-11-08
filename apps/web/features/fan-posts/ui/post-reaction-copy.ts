import type { AppLocale } from "@/i18n/locales";

/** 261107-2 C4·C5·9.2: post reactions, the one-line comment box (fan board and group board). */
type Copy = { like: string; dislike: string; dislikeCount: string; placeholder: string; post: string; gate: string; gateAction: string };

const copy: Record<AppLocale, Copy> = {
  ko: { like: "좋아요", dislike: "싫어요", dislikeCount: "싫어요 {0}", placeholder: "댓글 쓰기", post: "등록", gate: "이 페이지 패스포트가 있어야 댓글을 쓸 수 있어요", gateAction: "인증하기" },
  en: { like: "Like", dislike: "Dislike", dislikeCount: "Dislikes: {0}", placeholder: "Write a comment", post: "Post", gate: "You need this page's Passport to comment", gateAction: "Verify" },
  ja: { like: "いいね", dislike: "よくないね", dislikeCount: "よくないね {0}", placeholder: "コメントを書く", post: "投稿", gate: "コメントするにはこのページのパスポートが必要です", gateAction: "認証する" },
  "zh-Hans": { like: "赞", dislike: "踩", dislikeCount: "踩 {0}", placeholder: "写评论", post: "发布", gate: "需要本页面的护照才能评论", gateAction: "去认证" },
  "zh-Hant": { like: "讚", dislike: "倒讚", dislikeCount: "倒讚 {0}", placeholder: "寫留言", post: "發布", gate: "需要本頁面的護照才能留言", gateAction: "去認證" },
  es: { like: "Me gusta", dislike: "No me gusta", dislikeCount: "No me gusta: {0}", placeholder: "Escribe un comentario", post: "Publicar", gate: "Necesitas el pasaporte de esta página para comentar", gateAction: "Verificar" },
  id: { like: "Suka", dislike: "Tidak suka", dislikeCount: "Tidak suka: {0}", placeholder: "Tulis komentar", post: "Kirim", gate: "Perlu Paspor halaman ini untuk berkomentar", gateAction: "Verifikasi" },
  vi: { like: "Thích", dislike: "Không thích", dislikeCount: "Không thích: {0}", placeholder: "Viết bình luận", post: "Đăng", gate: "Cần Hộ chiếu của trang này để bình luận", gateAction: "Xác minh" },
  th: { like: "ถูกใจ", dislike: "ไม่ถูกใจ", dislikeCount: "ไม่ถูกใจ {0}", placeholder: "เขียนความคิดเห็น", post: "โพสต์", gate: "ต้องมีพาสปอร์ตของเพจนี้จึงจะแสดงความคิดเห็นได้", gateAction: "ยืนยัน" },
  pt: { like: "Curtir", dislike: "Não curtir", dislikeCount: "Não curtidas: {0}", placeholder: "Escreva um comentário", post: "Publicar", gate: "Você precisa do passaporte desta página para comentar", gateAction: "Verificar" },
  fr: { like: "J'aime", dislike: "Je n'aime pas", dislikeCount: "Je n'aime pas : {0}", placeholder: "Écrire un commentaire", post: "Publier", gate: "Le passeport de cette page est requis pour commenter", gateAction: "Vérifier" },
  ru: { like: "Нравится", dislike: "Не нравится", dislikeCount: "Не нравится: {0}", placeholder: "Написать комментарий", post: "Отправить", gate: "Чтобы комментировать, нужен паспорт этой страницы", gateAction: "Подтвердить" },
};

export function postReactionCopy(locale: AppLocale): Copy { return copy[locale] ?? copy.en; }
export const fill = (template: string, value: string) => template.replace("{0}", value);
