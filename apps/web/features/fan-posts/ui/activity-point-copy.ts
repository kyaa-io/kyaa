import type {AppLocale} from '@/i18n/locales';
type Copy={condition:string;remaining:string;dailyLimit:string;complete:string};
export const activityPointCopy:Record<AppLocale,Copy>={
 ko:{condition:'조건 충족 시 · 중복 제외',remaining:'오늘 {n}회 남음',dailyLimit:'오늘 적립 한도 도달',complete:'적립 횟수 소진'},
 en:{condition:'When eligible · duplicates excluded',remaining:'{n} left today',dailyLimit:'Daily reward limit reached',complete:'Reward limit reached'},
 ja:{condition:'条件達成時・重複対象外',remaining:'本日あと{n}回',dailyLimit:'本日の獲得上限に達しました',complete:'獲得回数の上限に達しました'},
 'zh-Hans':{condition:'满足条件时 · 重复不计',remaining:'今日剩余{n}次',dailyLimit:'已达今日奖励上限',complete:'已达奖励次数上限'},
 'zh-Hant':{condition:'符合條件時 · 重複不計',remaining:'今日剩餘{n}次',dailyLimit:'已達今日獎勵上限',complete:'已達獎勵次數上限'},
 es:{condition:'Si cumples los requisitos · sin duplicados',remaining:'Quedan {n} hoy',dailyLimit:'Límite diario alcanzado',complete:'Límite de recompensas alcanzado'},
 id:{condition:'Jika memenuhi syarat · tanpa duplikat',remaining:'Sisa {n} hari ini',dailyLimit:'Batas hadiah harian tercapai',complete:'Batas hadiah tercapai'},
 vi:{condition:'Khi đủ điều kiện · không tính trùng lặp',remaining:'Còn {n} lượt hôm nay',dailyLimit:'Đã đạt giới hạn thưởng hôm nay',complete:'Đã đạt giới hạn thưởng'},
 th:{condition:'เมื่อเข้าเงื่อนไข · ไม่นับรายการซ้ำ',remaining:'วันนี้เหลือ {n} ครั้ง',dailyLimit:'ถึงขีดจำกัดรางวัลวันนี้แล้ว',complete:'ถึงขีดจำกัดรางวัลแล้ว'},
 pt:{condition:'Quando elegível · sem duplicados',remaining:'Restam {n} hoje',dailyLimit:'Limite diário atingido',complete:'Limite de recompensas atingido'},
 fr:{condition:'Si éligible · doublons exclus',remaining:'Encore {n} aujourd’hui',dailyLimit:'Limite quotidienne atteinte',complete:'Limite de récompenses atteinte'},
 ru:{condition:'При выполнении условий · без повторов',remaining:'Осталось {n} на сегодня',dailyLimit:'Дневной лимит достигнут',complete:'Лимит наград достигнут'},
};
