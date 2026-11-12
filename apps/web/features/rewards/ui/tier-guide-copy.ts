import type { AppLocale } from "@/i18n/locales";
const copy: Record<AppLocale, readonly string[]> = {
  "ko": [
    "팬 등급 안내",
    "등급 체계를 알아볼까요?",
    "보러 가기",
    "닫기",
    "등급 체계",
    "획득 조건",
    "하트",
    "도장 칸"
  ],
  "en": [
    "Fan tier guide",
    "Explore the tier system?",
    "View guide",
    "Close",
    "Tier system",
    "Requirements",
    "Hearts",
    "Stamp slots"
  ],
  "ja": [
    "ファンランクガイド",
    "ランク制度を見てみませんか？",
    "見に行く",
    "閉じる",
    "ランク制度",
    "獲得条件",
    "ハート",
    "スタンプ枠"
  ],
  "zh-Hans": [
    "粉丝等级指南",
    "了解等级体系？",
    "查看指南",
    "关闭",
    "等级体系",
    "获取条件",
    "爱心",
    "印章格"
  ],
  "zh-Hant": [
    "粉絲等級指南",
    "了解等級體系？",
    "查看指南",
    "關閉",
    "等級體系",
    "獲取條件",
    "愛心",
    "印章格"
  ],
  "es": [
    "Guía de niveles de fan",
    "¿Conoces los niveles?",
    "Ver guía",
    "Cerrar",
    "Niveles",
    "Requisitos",
    "Corazones",
    "Casillas de sellos"
  ],
  "id": [
    "Panduan tingkat penggemar",
    "Kenali sistem tingkat?",
    "Lihat panduan",
    "Tutup",
    "Sistem tingkat",
    "Syarat",
    "Hati",
    "Slot stempel"
  ],
  "vi": [
    "Hướng dẫn cấp người hâm mộ",
    "Tìm hiểu hệ thống cấp?",
    "Xem hướng dẫn",
    "Đóng",
    "Hệ thống cấp",
    "Điều kiện",
    "Tim",
    "Ô dấu"
  ],
  "th": [
    "คู่มือระดับแฟน",
    "มารู้จักระบบระดับกันไหม?",
    "ดูคู่มือ",
    "ปิด",
    "ระบบระดับ",
    "เงื่อนไข",
    "หัวใจ",
    "ช่องตราประทับ"
  ],
  "pt": [
    "Guia de níveis de fã",
    "Conhecer os níveis?",
    "Ver guia",
    "Fechar",
    "Sistema de níveis",
    "Requisitos",
    "Corações",
    "Espaços de selos"
  ],
  "fr": [
    "Guide des niveaux de fan",
    "Découvrir les niveaux ?",
    "Voir le guide",
    "Fermer",
    "Niveaux",
    "Conditions",
    "Cœurs",
    "Cases de tampons"
  ],
  "ru": [
    "Уровни поклонника",
    "Узнать о системе уровней?",
    "Открыть",
    "Закрыть",
    "Система уровней",
    "Условия",
    "Сердца",
    "Ячейки штампов"
  ]
};
const rules: Record<AppLocale, readonly string[]> = {
  "ko": [
    "처음 시작하는 등급",
    "새 등급 획득 기준",
    "이전에 달성한 큰 등급은 유지돼요. 같은 등급 안의 숫자는 현재 활동 기록에 따라 정해져요."
  ],
  "en": [
    "Starting tier",
    "Requirements for a new tier",
    "Previously attained major tiers are retained. The number within a tier follows your current activity record."
  ],
  "ja": [
    "最初のランク",
    "新しいランクの獲得条件",
    "達成済みの大区分ランクは維持されます。ランク内の数字は現在の活動記録で決まります。"
  ],
  "zh-Hans": [
    "初始等级",
    "新等级获取条件",
    "保留已达到的大等级。等级内的数字根据当前活动记录确定。"
  ],
  "zh-Hant": [
    "初始等級",
    "新等級獲取條件",
    "保留已達到的大等級。等級內的數字根據目前活動紀錄決定。"
  ],
  "es": [
    "Nivel inicial",
    "Requisitos para un nuevo nivel",
    "Se conserva el nivel principal alcanzado. El número dentro del nivel depende de tu actividad actual."
  ],
  "id": [
    "Tingkat awal",
    "Syarat tingkat baru",
    "Tingkat utama yang telah dicapai tetap dipertahankan. Angka dalam tingkat mengikuti catatan aktivitas saat ini."
  ],
  "vi": [
    "Cấp ban đầu",
    "Điều kiện đạt cấp mới",
    "Cấp chính đã đạt được giữ nguyên. Số trong cấp dựa trên hoạt động hiện tại."
  ],
  "th": [
    "ระดับเริ่มต้น",
    "เงื่อนไขรับระดับใหม่",
    "ระดับหลักที่เคยทำได้จะคงอยู่ ตัวเลขภายในระดับขึ้นอยู่กับบันทึกกิจกรรมปัจจุบัน"
  ],
  "pt": [
    "Nível inicial",
    "Requisitos para novo nível",
    "O nível principal alcançado é mantido. O número dentro do nível segue a atividade atual."
  ],
  "fr": [
    "Niveau initial",
    "Conditions d’un nouveau niveau",
    "Le niveau principal atteint est conservé. Le numéro dans le niveau suit votre activité actuelle."
  ],
  "ru": [
    "Начальный уровень",
    "Условия нового уровня",
    "Достигнутый основной уровень сохраняется. Номер внутри уровня определяется текущей активностью."
  ]
};
export const tierGuideCopy = (locale: AppLocale) => { const [title, prompt, view, close, system, requirements, hearts, stamps] = copy[locale]; const [initial, attainment, rule] = rules[locale]; const minimum = (unit: string, n: number) => ({
ko: `${unit} ${n}개 이상`, en: `${unit}: ${n} or more`, ja: `${unit} ${n}個以上`,
"zh-Hans": `${unit}至少 ${n}`, "zh-Hant": `${unit}至少 ${n}`, es: `${unit}: ${n} o más`,
id: `${unit}: minimal ${n}`, vi: `${unit}: từ ${n}`, th: `${unit}: อย่างน้อย ${n}`,
pt: `${unit}: ${n} ou mais`, fr: `${unit} : ${n} minimum`, ru: `${unit}: от ${n}`
})[locale]; return {title, prompt, view, close, system, requirements, hearts, stamps, initial, attainment, rule, minimum}; };
