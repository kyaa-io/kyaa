import type { AppLocale } from "@/i18n/locales";

const rows = {
  ko: ["미션 진행", "체크인과 9개 미션의 진행 상태를 확인하세요.", "완료", "미완료", "확인 전"],
  en: ["Mission progress", "View your check-in and 9 mission statuses.", "Completed", "Not completed", "Not verified"],
  ja: ["ミッションの進捗", "チェックインと9個のミッションの進捗を確認できます。", "完了", "未完了", "未確認"],
  "zh-Hans": ["任务进度", "查看签到和9项任务的进度。", "已完成", "未完成", "未确认"],
  "zh-Hant": ["任務進度", "查看簽到和9項任務的進度。", "已完成", "未完成", "未確認"],
  es: ["Progreso de misiones", "Consulta el estado del registro y de las 9 misiones.", "Completado", "Sin completar", "Sin verificar"],
  id: ["Progres misi", "Lihat status check-in dan 9 misi Anda.", "Selesai", "Belum selesai", "Belum diverifikasi"],
  vi: ["Tiến độ nhiệm vụ", "Xem trạng thái điểm danh và 9 nhiệm vụ của bạn.", "Đã hoàn thành", "Chưa hoàn thành", "Chưa xác minh"],
  th: ["ความคืบหน้าภารกิจ", "ดูสถานะเช็กอินและภารกิจทั้ง 9 รายการ", "สำเร็จแล้ว", "ยังไม่สำเร็จ", "ยังไม่ได้ตรวจสอบ"],
  pt: ["Progresso das missões", "Veja o estado do check-in e das 9 missões.", "Concluído", "Não concluído", "Não verificado"],
  fr: ["Progression des missions", "Consultez l’état de votre enregistrement et des 9 missions.", "Terminé", "Non terminé", "Non vérifié"],
} satisfies Record<AppLocale, readonly [string, string, string, string, string]>;

const details = {
  ko: ["이 진행 상태는 도장 발급이나 응모권 교환을 뜻하지 않아요.", "미션 진행 상태를 불러오지 못했어요.", "행사 참여를 완료한 뒤 미션 진행 상태를 확인할 수 있어요."],
  en: ["This progress does not confirm stamp issuance or prize-draw entry exchange.", "Couldn't load mission progress.", "Complete event check-in to view your mission progress."],
  ja: ["この進捗はスタンプの発行や抽選券への交換を示すものではありません。", "ミッションの進捗を読み込めませんでした。", "イベントのチェックイン完了後に進捗を確認できます。"],
  "zh-Hans": ["此进度不代表已发放印章或兑换抽奖券。", "无法加载任务进度。", "完成活动签到后可查看任务进度。"],
  "zh-Hant": ["此進度不代表已發放印章或兌換抽獎券。", "無法載入任務進度。", "完成活動簽到後可查看任務進度。"],
  es: ["Este progreso no confirma la emisión de sellos ni el canje de participaciones para el sorteo.", "No se pudo cargar el progreso de las misiones.", "Completa el registro del evento para ver el progreso de tus misiones."],
  id: ["Progres ini tidak mengonfirmasi penerbitan stempel atau penukaran tiket undian.", "Progres misi gagal dimuat.", "Selesaikan check-in acara untuk melihat progres misi Anda."],
  vi: ["Tiến độ này không xác nhận việc cấp dấu hoặc đổi vé bốc thăm.", "Không thể tải tiến độ nhiệm vụ.", "Hoàn tất điểm danh sự kiện để xem tiến độ nhiệm vụ."],
  th: ["ความคืบหน้านี้ไม่ได้ยืนยันการออกแสตมป์หรือการแลกสิทธิ์จับรางวัล", "โหลดความคืบหน้าภารกิจไม่สำเร็จ", "เช็กอินงานให้เสร็จเพื่อดูความคืบหน้าภารกิจ"],
  pt: ["Este progresso não confirma a emissão de selos nem a troca por participações no sorteio.", "Não foi possível carregar o progresso das missões.", "Conclua o check-in do evento para ver o progresso das suas missões."],
  fr: ["Cette progression ne confirme ni l’attribution de tampons ni l’échange contre des participations au tirage au sort.", "Impossible de charger la progression des missions.", "Terminez l’enregistrement à l’événement pour consulter la progression de vos missions."],
} satisfies Record<AppLocale, readonly [string, string, string]>;

export function waveMissionsCopy(locale: AppLocale) {
  const [title, description, completed, pending, unverified] = rows[locale];
  const [help, error, participationRequired] = details[locale];
  return { title, description, completed, pending, unverified, help, error, participationRequired };
}
