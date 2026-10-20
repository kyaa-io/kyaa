import type { AppLocale } from "@/i18n/locales";

const rows = {
  ko: ["체크인한 참가자 전용", "행사 체크인을 완료한 참가자만 볼 수 있는 비공개 공간이에요. 이곳의 글과 사진은 참가자끼리만 공유돼요.", "간단한 자기소개를 남겨주세요. 본인 사진은 선택으로 첨부할 수 있어요.", "자기소개 쓰기", "간단한 자기소개", "본인 사진 (선택)", "어떤 일을 하고, 무엇에 관심이 있나요? 함께한 분들에게 짧게 소개해 주세요."],
  en: ["Checked-in participants only", "This private space is only for participants who have completed event check-in. Posts and photos are shared only with fellow participants.", "Introduce yourself briefly. You can add a photo of yourself if you like.", "Write an introduction", "A short introduction", "Your photo (optional)", "What do you do, and what interests you? Tell fellow participants a little about yourself."],
  ja: ["チェックイン済み参加者限定", "イベントのチェックインを完了した参加者だけが閲覧できる非公開のスペースです。投稿や写真は参加者同士でのみ共有されます。", "簡単な自己紹介を投稿してください。ご自身の写真の添付は任意です。", "自己紹介を書く", "簡単な自己紹介", "ご自身の写真（任意）", "どんなお仕事や活動をしていますか？興味のあることなど、参加者に簡単に自己紹介してください。"],
  "zh-Hans": ["仅限已签到的参与者", "这是仅限已完成活动签到的参与者查看的私密空间。帖子和照片仅在参与者之间分享。", "请简单介绍一下自己，也可以选择附上自己的照片。", "写自我介绍", "简单的自我介绍", "本人照片（选填）", "你从事什么工作，有什么兴趣？向其他参与者简单介绍一下自己吧。"],
  "zh-Hant": ["僅限已報到的參加者", "這是僅限已完成活動報到的參加者查看的私人空間。貼文和照片僅在參加者之間分享。", "請簡單介紹一下自己，也可以選擇附上自己的照片。", "寫自我介紹", "簡單的自我介紹", "本人照片（選填）", "你從事什麼工作，有什麼興趣？向其他參加者簡單介紹一下自己吧。"],
  es: ["Solo participantes registrados en el evento", "Este espacio privado es solo para quienes han completado el registro del evento. Las publicaciones y fotos solo se comparten entre participantes.", "Preséntate brevemente. Si quieres, puedes añadir una foto tuya.", "Escribir una presentación", "Una breve presentación", "Tu foto (opcional)", "¿A qué te dedicas y qué te interesa? Cuéntales un poco sobre ti a los demás participantes."],
  id: ["Khusus peserta yang sudah check-in", "Ruang privat ini hanya dapat dilihat peserta yang sudah check-in acara. Postingan dan foto hanya dibagikan antarpeserta.", "Perkenalkan dirimu secara singkat. Kamu boleh menambahkan foto diri.", "Tulis perkenalan", "Perkenalan singkat", "Foto diri (opsional)", "Apa pekerjaan dan minatmu? Perkenalkan dirimu secara singkat kepada peserta lain."],
  vi: ["Chỉ dành cho người đã điểm danh", "Đây là không gian riêng tư chỉ dành cho người đã hoàn tất điểm danh sự kiện. Bài viết và ảnh chỉ được chia sẻ giữa những người tham gia.", "Hãy giới thiệu ngắn gọn về bản thân. Bạn có thể đính kèm ảnh của mình nếu muốn.", "Viết giới thiệu", "Giới thiệu ngắn gọn", "Ảnh của bạn (không bắt buộc)", "Bạn làm công việc gì và quan tâm đến điều gì? Hãy giới thiệu đôi nét với những người cùng tham gia."],
  th: ["สำหรับผู้เข้าร่วมที่เช็กอินแล้วเท่านั้น", "พื้นที่ส่วนตัวนี้เปิดให้เฉพาะผู้ที่เช็กอินงานเรียบร้อยแล้ว โพสต์และรูปภาพจะแชร์กันเฉพาะในกลุ่มผู้เข้าร่วมเท่านั้น", "แนะนำตัวสั้น ๆ และแนบรูปของคุณได้หากต้องการ", "เขียนแนะนำตัว", "แนะนำตัวสั้น ๆ", "รูปของคุณ (ไม่บังคับ)", "คุณทำงานอะไรและสนใจเรื่องไหนบ้าง? แนะนำตัวสั้น ๆ ให้ผู้เข้าร่วมคนอื่นรู้จักกัน"],
  pt: ["Apenas participantes com check-in", "Este espaço privado é exclusivo para quem concluiu o check-in do evento. Publicações e fotos são compartilhadas apenas entre participantes.", "Apresente-se brevemente. Você pode adicionar uma foto sua se quiser.", "Escrever apresentação", "Uma breve apresentação", "Sua foto (opcional)", "O que você faz e quais são seus interesses? Conte um pouco sobre você aos outros participantes."],
  fr: ["Réservé aux participants ayant confirmé leur présence", "Cet espace privé est réservé aux participants ayant terminé l’enregistrement à l’événement. Les publications et photos ne sont partagées qu’entre participants.", "Présentez-vous brièvement. Vous pouvez ajouter une photo de vous si vous le souhaitez.", "Écrire une présentation", "Une courte présentation", "Votre photo (facultative)", "Que faites-vous et quels sont vos centres d’intérêt ? Présentez-vous en quelques mots aux autres participants."],
} satisfies Record<AppLocale, readonly [string, string, string, string, string, string, string]>;

export function wavePrivacyCopy(locale: AppLocale) {
  const [audience, notice, introduction, writeIntroduction, introductionLabel, optionalPhoto, introductionPrompt] = rows[locale];
  return { audience, notice, introduction, writeIntroduction, introductionLabel, optionalPhoto, introductionPrompt };
}

export const waveActivityNameNote: Record<AppLocale, string> = {
  "ko": "체크인 이름과 아바타가 KYAA WAVE 참가자에게 표시돼요.",
  "en": "Your check-in name and avatar are visible to KYAA WAVE participants.",
  "ja": "チェックイン時のお名前とアバターがKYAA WAVEの参加者に表示されます。",
  "zh-Hans": "您的签到姓名和头像将向 KYAA WAVE 参与者显示。",
  "zh-Hant": "您的報到姓名和頭像將向 KYAA WAVE 參與者顯示。",
  "es": "Tu nombre de registro y avatar se muestran a los participantes de KYAA WAVE.",
  "id": "Nama saat check-in dan avatar Anda terlihat oleh peserta KYAA WAVE.",
  "vi": "Tên dùng khi điểm danh và ảnh đại diện của bạn hiển thị với người tham gia KYAA WAVE.",
  "th": "ชื่อที่ใช้เช็กอินและอวาตาร์ของคุณจะแสดงให้ผู้เข้าร่วม KYAA WAVE เห็น",
  "pt": "Seu nome de check-in e avatar ficam visíveis aos participantes do KYAA WAVE.",
  "fr": "Votre nom d’enregistrement et votre avatar sont visibles par les participants de KYAA WAVE."
};
