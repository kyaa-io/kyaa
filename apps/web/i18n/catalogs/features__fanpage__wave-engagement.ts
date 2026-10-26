import type { AppLocale } from "@/i18n/locales";
const rows: Record<AppLocale, readonly [string, string, string, string, string]> = {
  ko: ["창하와 위나의 TikTok LIVE를 보고 응원댓글을 남겨 주세요. 방송 여부는 TikTok에서 확인할 수 있어요.", "LIVE 보러 가기", "나영석 PD님께 감사평 남기기", "나영석 PD님께 전하고 싶은 감사평을 글로 남겨 주세요. 사진이나 영상은 선택해서 첨부할 수 있어요.", "감사평을 적어 주세요."],
  en: ["Watch Changha and WENA on TikTok LIVE and leave a cheer. Check TikTok to see whether they are live.", "Watch LIVE", "Leave a thank-you for producer Na Young-seok", "Write a thank-you message for producer Na Young-seok. You can optionally attach photos or a video.", "Write your thank-you message."],
  ja: ["チャンハとWENAのTikTok LIVEを見て応援コメントを残しましょう。配信状況はTikTokで確認できます。", "LIVEを見る", "ナ・ヨンソクPDへ感謝のメッセージ", "ナ・ヨンソクPDへの感謝を文章で伝えてください。写真または動画は任意で添付できます。", "感謝のメッセージを書いてください。"],
  "zh-Hans": ["观看Changha和WENA的TikTok LIVE并留言应援。请在TikTok确认是否正在直播。", "观看LIVE", "给罗暎锡PD写感谢留言", "请写下想对罗暎锡PD说的感谢话语。照片或视频可选择添加。", "请写下感谢留言。"],
  "zh-Hant": ["觀看Changha和WENA的TikTok LIVE並留言應援。請在TikTok確認是否正在直播。", "觀看LIVE", "給羅暎錫PD寫感謝留言", "請寫下想對羅暎錫PD說的感謝話語。照片或影片可選擇附上。", "請寫下感謝留言。"],
  es: ["Mira a Changha y WENA en TikTok LIVE y deja tu apoyo. Consulta en TikTok si están en directo.", "Ver LIVE", "Agradece al productor Na Young-seok", "Escribe un mensaje de agradecimiento al productor Na Young-seok. Puedes adjuntar fotos o un vídeo si quieres.", "Escribe tu agradecimiento."],
  id: ["Tonton Changha dan WENA di TikTok LIVE dan beri dukungan. Lihat TikTok untuk mengetahui apakah mereka sedang siaran.", "Tonton LIVE", "Ucapan terima kasih untuk produser Na Young-seok", "Tulis ucapan terima kasih untuk produser Na Young-seok. Foto atau video boleh dilampirkan jika ingin.", "Tulis ucapan terima kasih Anda."],
  vi: ["Xem Changha và WENA trên TikTok LIVE và để lại lời cổ vũ. Kiểm tra TikTok để biết họ có đang phát trực tiếp không.", "Xem LIVE", "Gửi lời cảm ơn đến PD Na Young-seok", "Viết lời cảm ơn gửi đến PD Na Young-seok. Bạn có thể đính kèm ảnh hoặc video nếu muốn.", "Viết lời cảm ơn của bạn."],
  th: ["ชม Changha และ WENA บน TikTok LIVE และส่งข้อความเชียร์ ตรวจสอบสถานะการถ่ายทอดสดได้ที่ TikTok", "ดู LIVE", "ส่งคำขอบคุณถึง PD Na Young-seok", "เขียนข้อความขอบคุณถึง PD Na Young-seok โดยเลือกแนบรูปภาพหรือวิดีโอได้", "เขียนข้อความขอบคุณของคุณ"],
  pt: ["Assista a Changha e WENA no TikTok LIVE e deixe seu apoio. Confira no TikTok se estão ao vivo.", "Assistir LIVE", "Agradeça ao produtor Na Young-seok", "Escreva uma mensagem de agradecimento ao produtor Na Young-seok. Fotos ou vídeo são opcionais.", "Escreva seu agradecimento."],
  fr: ["Regardez Changha et WENA sur TikTok LIVE et laissez un encouragement. Vérifiez sur TikTok si le direct est en cours.", "Voir le LIVE", "Remercier le producteur Na Young-seok", "Écrivez un message de remerciement au producteur Na Young-seok. Les photos ou une vidéo sont facultatives.", "Écrivez votre message de remerciement."],
  ru: ["Смотрите Чанху и Вену на TikTok LIVE и оставляйте свои комментарии. Проверьте TikTok чтобы узнать, ведут ли они прямой эфир.", "Смотрите LIVE", "Оставьте благодарность продюсеру На Ён Соку.", "Напишите благодарственное сообщение продюсеру На Ён Соку. При желании вы можете прикрепить фотографии или видео.", "Напишите благодарственное сообщение."],

};
export function waveEngagementCopy(locale: AppLocale) {
  const [liveIntro, watch, insightTitle, insightIntro, insightPrompt] = rows[locale];
  return { liveIntro, watch, insightTitle, insightIntro, insightPrompt };
}
