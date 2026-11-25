import { parseAppLocale, type AppLocale } from "@/i18n/locales";

const titles = {
  "ko": ["눈썰미 연습생", "눈썰미 데뷔조", "사진 수집가", "기억력 센터", "올클리어", "출근길 러너", "피버 장인", "엔딩 요정"],
  "en": ["Eagle-eyed trainee", "Debut detective", "Photo collector", "Memory center", "All clear", "Commute runner", "Fever master", "Ending fairy"],
  "ja": ["目利き練習生", "目利きデビュー組", "写真コレクター", "記憶力センター", "オールクリア", "通勤ランナー", "フィーバー職人", "エンディング妖精"],
  "zh-Hans": ["眼力练习生", "眼力出道组", "照片收藏家", "记忆力中心位", "全部通关", "通勤跑者", "狂热大师", "结尾妖精"],
  "zh-Hant": ["眼力練習生", "眼力出道組", "照片收藏家", "記憶力中心位", "全部通關", "通勤跑者", "狂熱大師", "結尾妖精"],
  "es": ["Aprendiz con buen ojo", "Debut con buen ojo", "Coleccionista de fotos", "Estrella de la memoria", "Todo superado", "Corredor de camino al trabajo", "As del modo Fiebre", "Hada del cierre"],
  "fr": ["Œil de lynx en formation", "Début au regard affûté", "Collectionneur de photos", "Star de la mémoire", "Sans faute", "Sprinteur du matin", "As de la fièvre", "Fée du final"],
  "pt": ["Aprendiz de olho vivo", "Estreia de olho vivo", "Colecionador de fotos", "Estrela da memória", "Tudo concluído", "Corredor matinal", "Mestre da febre", "Fada do final"],
  "id": ["Trainee bermata jeli", "Tim debut bermata jeli", "Kolektor foto", "Bintang ingatan", "Tuntas semua", "Pelari komuter", "Master Fever", "Peri penutup"],
  "vi": ["Thực tập sinh tinh mắt", "Tân binh tinh mắt", "Nhà sưu tầm ảnh", "Ngôi sao trí nhớ", "Phá đảo", "Chân chạy giờ đi làm", "Cao thủ Fever", "Tiên tử kết màn"],
  "th": ["เด็กฝึกตาไว", "ทีมเดบิวต์ตาไว", "นักสะสมภาพ", "เซ็นเตอร์ความจำ", "เคลียร์ครบ", "นักวิ่งยามเช้า", "เซียนฟีเวอร์", "นางฟ้าปิดเวที"],
  "ru": ["Зоркий стажёр", "Зоркий дебютант", "Коллекционер фото", "Звезда памяти", "Всё пройдено", "Утренний бегун", "Мастер лихорадки", "Фея финала"],
  "mn": ["Гярхай дадлагажигч", "Гярхай дебютант", "Зураг цуглуулагч", "Ой тогтоолтын од", "Бүх үеийг давлаа", "Өглөөний гүйгч", "Галын мастер", "Төгсгөлийн дагина"],
} as const satisfies Record<AppLocale, readonly [string, string, string, string, string, string, string, string]>;

export function matchTitle(locale: string, round: number) {
  return titles[parseAppLocale(locale)][round - 1];
}

export function runTitle(locale: string, score: number) {
  const index = [4000, 10000, 18000].indexOf(score);
  return index >= 0 ? titles[parseAppLocale(locale)][5 + index] : undefined;
}
