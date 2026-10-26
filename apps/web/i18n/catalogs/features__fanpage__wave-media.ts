import type { AppLocale } from "@/i18n/locales";
const rows: Record<AppLocale, readonly [string, string, string, string, string, string, string, string]> = {
  ko: ["미디어", "사진·영상 올리기", "WAVE의 순간을 함께 나눠요.", "사진 최대 30장(장당 8MB) 또는 영상 1개(50MB·60초 이내). 사진은 서버에서 압축해요.", "설명 (선택)", "전체 보기", "프로필", "영상 재생"],
  en: ["Media", "Upload photos or video", "Share your WAVE moments.", "Up to 30 photos (8MB each) or 1 video (50MB, 60 seconds). Photos are compressed on the server.", "Caption (optional)", "View all", "Profile", "Play video"],
  ja: ["メディア", "写真・動画を投稿", "WAVEの瞬間を共有しましょう。", "写真30枚まで（各8MB）、または動画1本（50MB・60秒以内）。写真はサーバーで圧縮されます。", "説明（任意）", "すべて見る", "プロフィール", "動画を再生"],
  "zh-Hans": ["媒体", "上传照片或视频", "分享WAVE的精彩瞬间。", "最多30张照片（每张8MB）或1个视频（50MB、60秒以内）。照片由服务器压缩。", "说明（选填）", "查看全部", "个人主页", "播放视频"],
  "zh-Hant": ["媒體", "上傳照片或影片", "分享WAVE的精彩瞬間。", "最多30張照片（每張8MB）或1部影片（50MB、60秒內）。照片由伺服器壓縮。", "說明（選填）", "查看全部", "個人頁面", "播放影片"],
  es: ["Multimedia", "Subir fotos o vídeo", "Comparte tus momentos WAVE.", "Hasta 30 fotos (8MB cada una) o 1 vídeo (50MB, 60 segundos). Las fotos se comprimen en el servidor.", "Descripción (opcional)", "Ver todo", "Perfil", "Reproducir vídeo"],
  id: ["Media", "Unggah foto atau video", "Bagikan momen WAVE Anda.", "Maksimal 30 foto (masing-masing 8MB) atau 1 video (50MB, 60 detik). Foto dikompres di server.", "Keterangan (opsional)", "Lihat semua", "Profil", "Putar video"],
  vi: ["Ảnh và video", "Đăng ảnh hoặc video", "Chia sẻ khoảnh khắc WAVE.", "Tối đa 30 ảnh (mỗi ảnh 8MB) hoặc 1 video (50MB, 60 giây). Ảnh được nén trên máy chủ.", "Mô tả (không bắt buộc)", "Xem tất cả", "Trang cá nhân", "Phát video"],
  th: ["สื่อ", "อัปโหลดรูปภาพหรือวิดีโอ", "แบ่งปันช่วงเวลา WAVE ของคุณ", "รูปภาพสูงสุด 30 รูป (รูปละ 8MB) หรือวิดีโอ 1 คลิป (50MB ไม่เกิน 60 วินาที) รูปภาพจะถูกบีบอัดบนเซิร์ฟเวอร์", "คำอธิบาย (ไม่บังคับ)", "ดูทั้งหมด", "โปรไฟล์", "เล่นวิดีโอ"],
  pt: ["Mídia", "Publicar fotos ou vídeo", "Compartilhe seus momentos WAVE.", "Até 30 fotos (8MB cada) ou 1 vídeo (50MB, 60 segundos). As fotos são comprimidas no servidor.", "Descrição (opcional)", "Ver tudo", "Perfil", "Reproduzir vídeo"],
  fr: ["Médias", "Publier des photos ou une vidéo", "Partagez vos moments WAVE.", "Jusqu’à 30 photos (8Mo chacune) ou 1 vidéo (50Mo, 60 secondes). Les photos sont compressées sur le serveur.", "Description (facultative)", "Tout voir", "Profil", "Lire la vidéo"],
  ru: ["СМИ", "Загрузите фотографии или видео.", "Поделитесь своими моментами, WAVE .", "До 30 фотографий (по 8 МБ каждая) или 1 видео (50 МБ, 60 секунд). Фотографии сжимаются на сервере.", "Подпись (необязательно)", "Просмотреть все", "Профиль", "Воспроизвести видео"],

};
const videos: Record<AppLocale, readonly [string, string]> = {
  ko: ["영상 올리기", "영상은 1개, 50MB·60초 이내로 올려 주세요. 사진과 함께 올릴 수 없어요."],
  en: ["Upload video", "Choose one video up to 50MB and 60 seconds. Photos and video cannot be combined."],
  ja: ["動画を投稿", "動画は1本、50MB・60秒以内です。写真とは同時に投稿できません。"],
  "zh-Hans": ["上传视频", "请选择1个50MB、60秒以内的视频。不能与照片一起上传。"],
  "zh-Hant": ["上傳影片", "請選擇1部50MB、60秒以內的影片。不能與照片一起上傳。"],
  es: ["Subir vídeo", "Elige un vídeo de hasta 50MB y 60 segundos. No se puede combinar con fotos."],
  id: ["Unggah video", "Pilih satu video maksimal 50MB dan 60 detik. Foto dan video tidak dapat digabungkan."],
  vi: ["Đăng video", "Chọn một video tối đa 50MB và 60 giây. Không thể đăng ảnh cùng video."],
  th: ["อัปโหลดวิดีโอ", "เลือกวิดีโอ 1 คลิป ขนาดไม่เกิน 50MB และ 60 วินาที ไม่สามารถอัปโหลดพร้อมรูปภาพได้"],
  pt: ["Publicar vídeo", "Escolha um vídeo de até 50MB e 60 segundos. Não é possível combinar fotos e vídeo."],
  fr: ["Publier une vidéo", "Choisissez une vidéo de 50Mo et 60 secondes maximum. Photos et vidéo ne peuvent pas être combinées."],
  ru: ["Загрузить видео", "Выберите один видеоролик размером до 50 МБ и продолжительностью до 60 секунд. Фотографии и видео не объединяются."],

};
export function waveMediaCopy(locale: AppLocale) {
  const [title, upload, intro, limits, caption, viewAll, profile, play] = rows[locale];
  const [uploadVideo, videoLimit] = videos[locale];
  return { title, upload, intro, limits, caption, viewAll, profile, play, uploadVideo, videoLimit };
}
