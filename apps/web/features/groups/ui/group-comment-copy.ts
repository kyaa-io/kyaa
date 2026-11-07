import type { AppLocale } from "@/i18n/locales";

const keys = ["menu", "copy", "copied", "deleteTitle", "saveFailed", "deleteFailed", "reportSent", "reportFailed", "uploadFailed", "replyTo"] as const;
const values: Record<AppLocale, readonly string[]> = {
  ko: ["댓글 메뉴", "복사", "댓글을 복사했어요", "댓글을 삭제할까요?", "댓글을 저장하지 못했어요", "댓글을 삭제하지 못했어요", "신고를 접수했어요", "신고를 보내지 못했어요", "파일을 올리지 못했어요", "{0}님에게 답글"],
  en: ["Comment menu", "Copy", "Comment copied", "Delete this comment?", "Couldn’t post your comment", "Couldn’t delete the comment", "Report sent", "Couldn’t send the report", "Couldn’t upload the file", "Reply to {0}"],
  ja: ["コメントメニュー", "コピー", "コメントをコピーしました", "コメントを削除しますか？", "コメントを保存できませんでした", "コメントを削除できませんでした", "通報を受け付けました", "通報を送信できませんでした", "ファイルをアップロードできませんでした", "{0}さんに返信"],
  "zh-Hans": ["评论菜单", "复制", "已复制评论", "要删除这条评论吗？", "评论未能保存", "评论未能删除", "已提交举报", "举报未能发送", "文件未能上传", "回复 {0}"],
  "zh-Hant": ["留言選單", "複製", "已複製留言", "要刪除這則留言嗎？", "留言未能儲存", "留言未能刪除", "已送出檢舉", "檢舉未能送出", "檔案未能上傳", "回覆 {0}"],
  es: ["Menú del comentario", "Copiar", "Comentario copiado", "¿Eliminar este comentario?", "No se pudo publicar el comentario", "No se pudo eliminar el comentario", "Denuncia enviada", "No se pudo enviar la denuncia", "No se pudo subir el archivo", "Responder a {0}"],
  id: ["Menu komentar", "Salin", "Komentar disalin", "Hapus komentar ini?", "Komentar gagal dikirim", "Komentar gagal dihapus", "Laporan terkirim", "Laporan gagal dikirim", "File gagal diunggah", "Balas {0}"],
  vi: ["Menu bình luận", "Sao chép", "Đã sao chép bình luận", "Xóa bình luận này?", "Không thể đăng bình luận", "Không thể xóa bình luận", "Đã gửi báo cáo", "Không thể gửi báo cáo", "Không thể tải tệp lên", "Trả lời {0}"],
  th: ["เมนูความคิดเห็น", "คัดลอก", "คัดลอกความคิดเห็นแล้ว", "ลบความคิดเห็นนี้ไหม", "โพสต์ความคิดเห็นไม่สำเร็จ", "ลบความคิดเห็นไม่สำเร็จ", "ส่งรายงานแล้ว", "ส่งรายงานไม่สำเร็จ", "อัปโหลดไฟล์ไม่สำเร็จ", "ตอบกลับ {0}"],
  pt: ["Menu do comentário", "Copiar", "Comentário copiado", "Excluir este comentário?", "Não foi possível publicar o comentário", "Não foi possível excluir o comentário", "Denúncia enviada", "Não foi possível enviar a denúncia", "Não foi possível enviar o arquivo", "Responder a {0}"],
  fr: ["Menu du commentaire", "Copier", "Commentaire copié", "Supprimer ce commentaire ?", "Impossible de publier le commentaire", "Impossible de supprimer le commentaire", "Signalement envoyé", "Impossible d’envoyer le signalement", "Impossible d’envoyer le fichier", "Répondre à {0}"],
  ru: ["Меню комментария", "Копировать", "Комментарий скопирован", "Удалить этот комментарий?", "Не удалось опубликовать комментарий", "Не удалось удалить комментарий", "Жалоба отправлена", "Не удалось отправить жалобу", "Не удалось загрузить файл", "Ответ для {0}"],
};
export type GroupCommentCopy = Record<typeof keys[number], string>;
export function groupCommentCopy(locale: AppLocale): GroupCommentCopy {
  return Object.fromEntries(keys.map((key, index) => [key, values[locale][index]])) as GroupCommentCopy;
}
