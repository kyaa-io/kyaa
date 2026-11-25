import type { AppLocale } from "@/i18n/locales";

// 카드 번호 순서는 메이저, 완드, 컵, 소드, 펜타클이다.
const notes: Record<AppLocale, readonly [string, string, string, string, string]> = {
  ko: ["하루의 일보다 앞으로의 방향을 보여 주는 카드예요.", "작은 행동이 변화를 만드는 카드예요.", "감정과 관계를 살피는 카드예요.", "생각과 말에 힘이 실리는 카드예요.", "돈과 몸, 일상의 습관을 살피는 카드예요."],
  en: ["This card looks beyond today to the direction things are taking.", "Small actions bring change.", "Pay attention to feelings and relationships.", "Thoughts and words carry weight.", "Look at money, health and daily habits."],
  ja: ["今日の出来事より、これからの方向を示すカードです。", "小さな行動が変化につながります。", "気持ちや人との関係に目を向けて。", "考えや言葉に重みがあります。", "お金や体、日々の習慣を見直して。"],
  "zh-Hans": ["这张牌看的是今后的方向。", "小小的行动会带来改变。", "留意感受和人际关系。", "想法和言语都有分量。", "关注金钱、身体和日常习惯。"],
  "zh-Hant": ["這張牌看的是今後的方向。", "小小的行動會帶來改變。", "留意感受和人際關係。", "想法和言語都有分量。", "關注金錢、身體和日常習慣。"],
  es: ["Esta carta señala el rumbo más allá de hoy.", "Los pequeños pasos traen cambios.", "Presta atención a los sentimientos y las relaciones.", "Las ideas y las palabras tienen peso.", "Observa tus finanzas, tu salud y tus hábitos."],
  id: ["Kartu ini menunjukkan arah setelah hari ini.", "Langkah kecil membawa perubahan.", "Perhatikan perasaan dan hubungan.", "Pikiran dan kata-kata punya pengaruh.", "Perhatikan uang, kesehatan, dan kebiasaan sehari-hari."],
  vi: ["Lá bài này cho thấy hướng đi sau hôm nay.", "Hành động nhỏ tạo nên thay đổi.", "Hãy để ý đến cảm xúc và các mối quan hệ.", "Suy nghĩ và lời nói đều có sức nặng.", "Hãy nhìn lại tiền bạc, sức khỏe và thói quen hằng ngày."],
  th: ["ไพ่ใบนี้ชี้ทิศทางในวันข้างหน้า", "การลงมือทำเล็ก ๆ นำไปสู่ความเปลี่ยนแปลง", "ใส่ใจความรู้สึกและความสัมพันธ์", "ความคิดและคำพูดมีน้ำหนัก", "ลองทบทวนเรื่องเงิน สุขภาพ และกิจวัตรประจำวัน"],
  pt: ["Esta carta indica o rumo para além de hoje.", "Pequenas ações trazem mudanças.", "Preste atenção aos sentimentos e às relações.", "Ideias e palavras têm peso.", "Observe suas finanças, sua saúde e seus hábitos."],
  fr: ["Cette carte indique la direction à suivre au-delà de cette journée.", "Les petits gestes font bouger les choses.", "Prête attention aux émotions et aux relations.", "Les pensées et les mots ont du poids.", "Regarde tes finances, ta santé et tes habitudes."],
  ru: ["Эта карта показывает, куда движутся события.", "Маленькие шаги ведут к переменам.", "Обрати внимание на чувства и отношения.", "Мысли и слова имеют вес.", "Присмотрись к деньгам, здоровью и повседневным привычкам."],
  mn: ["Энэ хөзөр өнөөдрөөс цааших чиглэлийг харуулна.", "Жижиг алхам өөрчлөлт авчирна.", "Мэдрэмж, харилцаандаа анхаар.", "Бодол, үг хоёр жинтэй.", "Мөнгө, эрүүл мэнд, өдөр тутмын дадлаа анзаар."],
};

export function tarotFieldNote(card: number, locale: AppLocale) {
  return notes[locale][card < 22 ? 0 : 1 + Math.floor((card - 22) / 14)];
}
