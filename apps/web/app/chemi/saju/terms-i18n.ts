/**
 * 사주 용어의 언어별 표준 번역 표(천간·지지·오행·십신·기둥·12운성·12신살·합충·절기).
 * 한국어 화면은 이 표를 쓰지 않는다(chart.ts 의 한글 이름 그대로). 한국어 밖 12개 언어는 사주 결과·명식표·운세 일진이 모두 이 표 하나를 쓴다.
 * 천간·지지는 어느 언어든 한자(甲·子)를 먼저 보이고, 읽는 법이 따로 있는 언어만 옆에 붙인다(일본어·중국어는 한자만).
 */
import type { AppLocale } from "@/i18n/locales";
import {
  branches,
  branchHanja,
  stemHanja,
  stems,
  tenGodGroups,
  tenGods,
  type Branch,
  type ChartRelationKind,
  type Element,
  type PillarKey,
  type Stem,
  type StrengthClass,
  type TenGod,
  type TenGodGroup,
} from "./chart";

export type TermLocale = Exclude<AppLocale, "ko">;

export const lifeStages = ["장생", "목욕", "관대", "건록", "제왕", "쇠", "병", "사", "묘", "절", "태", "양"] as const;
export const spiritStars = ["겁살", "재살", "천살", "지살", "년살", "월살", "망신살", "장성살", "반안살", "역마살", "육해살", "화개살"] as const;
/** 달이 시작하는 절기 12개(인월부터). */
export const monthTerms = ["입춘", "경칩", "청명", "입하", "망종", "소서", "입추", "백로", "한로", "입동", "대설", "소한"] as const;
const relationKinds = ["천간합", "천간충", "방합", "삼합", "반합", "육합", "충", "형", "자형", "합", "무난"] as const;
export type RelationWord = ChartRelationKind | "합" | "무난";

type Words = {
  /** 천간 10 · 지지 12 읽기. 빈 배열이면 한자만 쓴다. */
  stem: readonly string[];
  branch: readonly string[];
  /** 나무 불 흙 쇠 물 */
  element: readonly [string, string, string, string, string];
  yin: string;
  yang: string;
  /** 비견 겁재 식신 상관 편재 정재 편관 정관 편인 정인 */
  god: readonly string[];
  /** 비겁 식상 재성 관성 인성 */
  group: readonly string[];
  /** 시 일 월 연 기둥 이름, 그리고 '나' */
  pillar: readonly [string, string, string, string];
  me: string;
  /** 시간 일간 월간 연간 */
  stemSeat: readonly [string, string, string, string];
  /** 시지 일지 월지 연지 */
  branchSeat: readonly [string, string, string, string];
  /** 명식표 줄 이름: 십신 천간 지지 지장간 12운성 12신살. 칸이 40px 안팎이라 짧게 쓴다. */
  row: readonly [string, string, string, string, string, string];
  stage: readonly string[];
  spirit: readonly string[];
  /** 천간합 천간충 방합 삼합 반합 육합 충 형 자형 합 무난 */
  relation: readonly string[];
  /** 입춘 경칩 청명 입하 망종 소서 입추 백로 한로 입동 대설 소한 */
  solarTerm: readonly string[];
  /** 신약 중화 신강 */
  strength: readonly [string, string, string];
  /** 쥐 소 범 토끼 용 뱀 말 양 원숭이 닭 개 돼지. 문장 묶음의 yearName 틀("Año {animal}")에 그대로 끼우는 꼴로 적는다. */
  animal: readonly string[];
};

const romanStem = ["Gap", "Eul", "Byeong", "Jeong", "Mu", "Gi", "Gyeong", "Sin", "Im", "Gye"];
const romanBranch = ["ja", "chuk", "in", "myo", "jin", "sa", "o", "mi", "sin", "yu", "sul", "hae"];

const words: Record<TermLocale, Words> = {
  en: {
    stem: romanStem, branch: romanBranch,
    element: ["Wood", "Fire", "Earth", "Metal", "Water"], yin: "Yin", yang: "Yang",
    god: ["Peer", "Rival", "Eating god", "Hurting officer", "Indirect wealth", "Direct wealth", "Seven killings", "Direct officer", "Indirect resource", "Direct resource"],
    group: ["Peers", "Output", "Wealth", "Authority", "Resource"],
    pillar: ["Hour", "Day", "Month", "Year"], me: "me",
    stemSeat: ["Hour stem", "Day stem", "Month stem", "Year stem"],
    branchSeat: ["Hour branch", "Day branch", "Month branch", "Year branch"],
    row: ["God", "Stem", "Branch", "Hidden", "Stage", "Star"],
    stage: ["Birth", "Bath", "Crown", "Office", "Peak", "Decline", "Illness", "Death", "Tomb", "End", "Womb", "Nurture"],
    spirit: ["Robbery", "Hazard", "Heaven", "Ground", "Charm", "Moon", "Exposure", "General", "Saddle", "Travel", "Six harms", "Canopy"],
    relation: ["Stem merge", "Stem clash", "Seasonal merge", "Triple merge", "Half merge", "Six merge", "Clash", "Punishment", "Self-punishment", "Merge", "Neutral"],
    solarTerm: ["Start of Spring", "Insects Awaken", "Clear and Bright", "Start of Summer", "Grain in Ear", "Minor Heat", "Start of Autumn", "White Dew", "Cold Dew", "Start of Winter", "Major Snow", "Minor Cold"],
    strength: ["Weak", "Balanced", "Strong"],
    animal: ["Rat", "Ox", "Tiger", "Rabbit", "Dragon", "Snake", "Horse", "Goat", "Monkey", "Rooster", "Dog", "Pig"],
  },
  ja: {
    stem: [], branch: [],
    element: ["木", "火", "土", "金", "水"], yin: "陰", yang: "陽",
    god: ["比肩", "劫財", "食神", "傷官", "偏財", "正財", "偏官", "正官", "偏印", "印綬"],
    group: ["比劫", "食傷", "財星", "官星", "印星"],
    pillar: ["時柱", "日柱", "月柱", "年柱"], me: "私",
    stemSeat: ["時干", "日干", "月干", "年干"],
    branchSeat: ["時支", "日支", "月支", "年支"],
    row: ["通変", "天干", "地支", "蔵干", "十二運", "神殺"],
    stage: ["長生", "沐浴", "冠帯", "建禄", "帝旺", "衰", "病", "死", "墓", "絶", "胎", "養"],
    spirit: ["劫殺", "災殺", "天殺", "地殺", "年殺", "月殺", "亡身殺", "将星殺", "攀鞍殺", "駅馬殺", "六害殺", "華蓋殺"],
    relation: ["干合", "天干の冲", "方合", "三合", "半合", "支合", "冲", "刑", "自刑", "合", "平穏"],
    solarTerm: ["立春", "啓蟄", "清明", "立夏", "芒種", "小暑", "立秋", "白露", "寒露", "立冬", "大雪", "小寒"],
    strength: ["身弱", "中和", "身強"],
    animal: ["子（ねずみ）", "丑（うし）", "寅（とら）", "卯（うさぎ）", "辰（たつ）", "巳（へび）", "午（うま）", "未（ひつじ）", "申（さる）", "酉（とり）", "戌（いぬ）", "亥（いのしし）"],
  },
  "zh-Hans": {
    stem: [], branch: [],
    element: ["木", "火", "土", "金", "水"], yin: "阴", yang: "阳",
    god: ["比肩", "劫财", "食神", "伤官", "偏财", "正财", "七杀", "正官", "偏印", "正印"],
    group: ["比劫", "食伤", "财星", "官杀", "印星"],
    pillar: ["时柱", "日柱", "月柱", "年柱"], me: "我",
    stemSeat: ["时干", "日干", "月干", "年干"],
    branchSeat: ["时支", "日支", "月支", "年支"],
    row: ["十神", "天干", "地支", "藏干", "十二运", "神煞"],
    stage: ["长生", "沐浴", "冠带", "临官", "帝旺", "衰", "病", "死", "墓", "绝", "胎", "养"],
    spirit: ["劫煞", "灾煞", "天煞", "地煞", "年煞", "月煞", "亡神", "将星", "攀鞍", "驿马", "六害", "华盖"],
    relation: ["天干合", "天干冲", "三会", "三合", "半合", "六合", "冲", "刑", "自刑", "合", "平稳"],
    solarTerm: ["立春", "惊蛰", "清明", "立夏", "芒种", "小暑", "立秋", "白露", "寒露", "立冬", "大雪", "小寒"],
    strength: ["身弱", "中和", "身强"],
    animal: ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"],
  },
  "zh-Hant": {
    stem: [], branch: [],
    element: ["木", "火", "土", "金", "水"], yin: "陰", yang: "陽",
    god: ["比肩", "劫財", "食神", "傷官", "偏財", "正財", "七殺", "正官", "偏印", "正印"],
    group: ["比劫", "食傷", "財星", "官殺", "印星"],
    pillar: ["時柱", "日柱", "月柱", "年柱"], me: "我",
    stemSeat: ["時干", "日干", "月干", "年干"],
    branchSeat: ["時支", "日支", "月支", "年支"],
    row: ["十神", "天干", "地支", "藏干", "十二運", "神煞"],
    stage: ["長生", "沐浴", "冠帶", "臨官", "帝旺", "衰", "病", "死", "墓", "絕", "胎", "養"],
    spirit: ["劫煞", "災煞", "天煞", "地煞", "年煞", "月煞", "亡神", "將星", "攀鞍", "驛馬", "六害", "華蓋"],
    relation: ["天干合", "天干沖", "三會", "三合", "半合", "六合", "沖", "刑", "自刑", "合", "平穩"],
    solarTerm: ["立春", "驚蟄", "清明", "立夏", "芒種", "小暑", "立秋", "白露", "寒露", "立冬", "大雪", "小寒"],
    strength: ["身弱", "中和", "身強"],
    animal: ["鼠", "牛", "虎", "兔", "龍", "蛇", "馬", "羊", "猴", "雞", "狗", "豬"],
  },
  es: {
    stem: romanStem, branch: romanBranch,
    element: ["Madera", "Fuego", "Tierra", "Metal", "Agua"], yin: "Yin", yang: "Yang",
    god: ["Compañero", "Rival", "Dios del alimento", "Oficial hiriente", "Riqueza indirecta", "Riqueza directa", "Siete muertes", "Oficial directo", "Recurso indirecto", "Recurso directo"],
    group: ["Pares", "Expresión", "Riqueza", "Autoridad", "Recurso"],
    pillar: ["Hora", "Día", "Mes", "Año"], me: "yo",
    stemSeat: ["Tallo de la hora", "Tallo del día", "Tallo del mes", "Tallo del año"],
    branchSeat: ["Rama de la hora", "Rama del día", "Rama del mes", "Rama del año"],
    row: ["Dios", "Tallo", "Rama", "Oculto", "Etapa", "Astro"],
    stage: ["Nacer", "Baño", "Corona", "Cargo", "Cima", "Declive", "Mal", "Muerte", "Tumba", "Corte", "Seno", "Crianza"],
    spirit: ["Robo", "Riesgo", "Cielo", "Suelo", "Encanto", "Luna", "Exposición", "General", "Montura", "Viaje", "Seis daños", "Dosel"],
    relation: ["Unión de tallos", "Choque de tallos", "Unión estacional", "Triple unión", "Media unión", "Unión de seis", "Choque", "Castigo", "Autocastigo", "Unión", "Neutro"],
    solarTerm: ["Inicio de la primavera", "Despertar de los insectos", "Claridad pura", "Inicio del verano", "Grano en espiga", "Calor menor", "Inicio del otoño", "Rocío blanco", "Rocío frío", "Inicio del invierno", "Gran nevada", "Frío menor"],
    strength: ["Débil", "Equilibrado", "Fuerte"],
    animal: ["de la Rata", "del Buey", "del Tigre", "del Conejo", "del Dragón", "de la Serpiente", "del Caballo", "de la Cabra", "del Mono", "del Gallo", "del Perro", "del Cerdo"],
  },
  id: {
    stem: romanStem, branch: romanBranch,
    element: ["Kayu", "Api", "Tanah", "Logam", "Air"], yin: "Yin", yang: "Yang",
    god: ["Rekan", "Pesaing", "Dewa pangan", "Pejabat pelukai", "Harta tak langsung", "Harta langsung", "Tujuh pembunuh", "Pejabat langsung", "Sumber tak langsung", "Sumber langsung"],
    group: ["Rekan", "Ekspresi", "Harta", "Otoritas", "Sumber"],
    pillar: ["Jam", "Hari", "Bulan", "Tahun"], me: "aku",
    stemSeat: ["Batang jam", "Batang hari", "Batang bulan", "Batang tahun"],
    branchSeat: ["Cabang jam", "Cabang hari", "Cabang bulan", "Cabang tahun"],
    row: ["Dewa", "Batang", "Cabang", "Samar", "Tahap", "Bintang"],
    stage: ["Lahir", "Mandi", "Mahkota", "Jabatan", "Puncak", "Surut", "Sakit", "Mati", "Makam", "Putus", "Rahim", "Asuh"],
    spirit: ["Rampas", "Bahaya", "Langit", "Bumi", "Pesona", "Bulan", "Tersingkap", "Jenderal", "Pelana", "Kelana", "Enam luka", "Tudung"],
    relation: ["Paduan batang", "Benturan batang", "Paduan musim", "Paduan tiga", "Paduan separuh", "Paduan enam", "Benturan", "Hukuman", "Hukuman diri", "Paduan", "Netral"],
    solarTerm: ["Awal Musim Semi", "Serangga Terjaga", "Cerah Terang", "Awal Musim Panas", "Biji Berbulir", "Panas Kecil", "Awal Musim Gugur", "Embun Putih", "Embun Dingin", "Awal Musim Dingin", "Salju Besar", "Dingin Kecil"],
    strength: ["Lemah", "Seimbang", "Kuat"],
    animal: ["Tikus", "Kerbau", "Macan", "Kelinci", "Naga", "Ular", "Kuda", "Kambing", "Monyet", "Ayam", "Anjing", "Babi"],
  },
  vi: {
    stem: ["Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ", "Canh", "Tân", "Nhâm", "Quý"],
    branch: ["Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi", "Thân", "Dậu", "Tuất", "Hợi"],
    element: ["Mộc", "Hỏa", "Thổ", "Kim", "Thủy"], yin: "Âm", yang: "Dương",
    god: ["Tỷ Kiên", "Kiếp Tài", "Thực Thần", "Thương Quan", "Thiên Tài", "Chính Tài", "Thất Sát", "Chính Quan", "Thiên Ấn", "Chính Ấn"],
    group: ["Tỷ Kiếp", "Thực Thương", "Tài Tinh", "Quan Sát", "Ấn Tinh"],
    pillar: ["Giờ", "Ngày", "Tháng", "Năm"], me: "tôi",
    stemSeat: ["Can giờ", "Can ngày", "Can tháng", "Can năm"],
    branchSeat: ["Chi giờ", "Chi ngày", "Chi tháng", "Chi năm"],
    row: ["Thần", "Can", "Chi", "Tàng", "Vận", "Sát"],
    stage: ["Trường Sinh", "Mộc Dục", "Quan Đới", "Lâm Quan", "Đế Vượng", "Suy", "Bệnh", "Tử", "Mộ", "Tuyệt", "Thai", "Dưỡng"],
    spirit: ["Kiếp Sát", "Tai Sát", "Thiên Sát", "Địa Sát", "Niên Sát", "Nguyệt Sát", "Vong Thần", "Tướng Tinh", "Phan Yên", "Dịch Mã", "Lục Hại", "Hoa Cái"],
    relation: ["Thiên can hợp", "Thiên can xung", "Tam hội", "Tam hợp", "Bán hợp", "Lục hợp", "Xung", "Hình", "Tự hình", "Hợp", "Bình ổn"],
    solarTerm: ["Lập Xuân", "Kinh Trập", "Thanh Minh", "Lập Hạ", "Mang Chủng", "Tiểu Thử", "Lập Thu", "Bạch Lộ", "Hàn Lộ", "Lập Đông", "Đại Tuyết", "Tiểu Hàn"],
    strength: ["Thân nhược", "Trung hòa", "Thân vượng"],
    animal: ["Tý (Chuột)", "Sửu (Trâu)", "Dần (Hổ)", "Mão (Mèo)", "Thìn (Rồng)", "Tỵ (Rắn)", "Ngọ (Ngựa)", "Mùi (Dê)", "Thân (Khỉ)", "Dậu (Gà)", "Tuất (Chó)", "Hợi (Lợn)"],
  },
  th: {
    stem: romanStem, branch: romanBranch,
    element: ["ไม้", "ไฟ", "ดิน", "ทอง", "น้ำ"], yin: "หยิน", yang: "หยาง",
    god: ["เพื่อนร่วมทาง", "คู่แข่ง", "เทพอาหาร", "ผู้ท้าอำนาจ", "ทรัพย์จร", "ทรัพย์ประจำ", "เจ็ดพิฆาต", "อำนาจตรง", "อุปถัมภ์รอง", "อุปถัมภ์หลัก"],
    group: ["พวกพ้อง", "การแสดงออก", "ทรัพย์", "อำนาจ", "อุปถัมภ์"],
    pillar: ["ยาม", "วัน", "เดือน", "ปี"], me: "ฉัน",
    stemSeat: ["ราศีบนยาม", "ราศีบนวัน", "ราศีบนเดือน", "ราศีบนปี"],
    branchSeat: ["ราศีล่างยาม", "ราศีล่างวัน", "ราศีล่างเดือน", "ราศีล่างปี"],
    row: ["เทพ", "บน", "ล่าง", "แฝง", "ช่วง", "ดาว"],
    stage: ["เกิด", "อาบน้ำ", "สวมมงกุฎ", "รับตำแหน่ง", "รุ่งสุด", "ถดถอย", "ป่วย", "ดับ", "สุสาน", "สิ้นสุด", "ครรภ์", "เลี้ยงดู"],
    spirit: ["ดาวชิง", "ดาวภัย", "ดาวฟ้า", "ดาวดิน", "ดาวเสน่ห์", "ดาวเดือน", "ดาวเปิดเผย", "ดาวแม่ทัพ", "ดาวอาน", "ดาวม้าเดินทาง", "ดาวหกภัย", "ดาวฉัตร"],
    relation: ["ราศีบนรวม", "ราศีบนปะทะ", "รวมตามฤดู", "สามรวม", "ครึ่งรวม", "หกรวม", "ปะทะ", "เบียดเบียน", "เบียดเบียนตน", "รวม", "ราบเรียบ"],
    solarTerm: ["เริ่มฤดูใบไม้ผลิ", "แมลงตื่น", "เช็งเม้ง", "เริ่มฤดูร้อน", "เมล็ดออกรวง", "ร้อนน้อย", "เริ่มฤดูใบไม้ร่วง", "น้ำค้างขาว", "น้ำค้างเย็น", "เริ่มฤดูหนาว", "หิมะใหญ่", "หนาวน้อย"],
    strength: ["กำลังอ่อน", "สมดุล", "กำลังแข็ง"],
    animal: ["ชวด (หนู)", "ฉลู (วัว)", "ขาล (เสือ)", "เถาะ (กระต่าย)", "มะโรง (มังกร)", "มะเส็ง (งู)", "มะเมีย (ม้า)", "มะแม (แพะ)", "วอก (ลิง)", "ระกา (ไก่)", "จอ (หมา)", "กุน (หมู)"],
  },
  pt: {
    stem: romanStem, branch: romanBranch,
    element: ["Madeira", "Fogo", "Terra", "Metal", "Água"], yin: "Yin", yang: "Yang",
    god: ["Companheiro", "Rival", "Deus do alimento", "Oficial ferino", "Riqueza indireta", "Riqueza direta", "Sete mortes", "Oficial direto", "Recurso indireto", "Recurso direto"],
    group: ["Pares", "Expressão", "Riqueza", "Autoridade", "Recurso"],
    pillar: ["Hora", "Dia", "Mês", "Ano"], me: "eu",
    stemSeat: ["Tronco da hora", "Tronco do dia", "Tronco do mês", "Tronco do ano"],
    branchSeat: ["Ramo da hora", "Ramo do dia", "Ramo do mês", "Ramo do ano"],
    row: ["Deus", "Tronco", "Ramo", "Oculto", "Fase", "Astro"],
    stage: ["Nascer", "Banho", "Coroa", "Cargo", "Auge", "Declínio", "Doença", "Morte", "Túmulo", "Corte", "Ventre", "Criação"],
    spirit: ["Roubo", "Risco", "Céu", "Chão", "Encanto", "Lua", "Exposição", "General", "Sela", "Viagem", "Seis danos", "Dossel"],
    relation: ["União de troncos", "Choque de troncos", "União sazonal", "União tripla", "Meia união", "União de seis", "Choque", "Punição", "Autopunição", "União", "Neutro"],
    solarTerm: ["Início da primavera", "Despertar dos insetos", "Claridade pura", "Início do verão", "Grão em espiga", "Calor menor", "Início do outono", "Orvalho branco", "Orvalho frio", "Início do inverno", "Grande neve", "Frio menor"],
    strength: ["Fraco", "Equilibrado", "Forte"],
    animal: ["do Rato", "do Boi", "do Tigre", "do Coelho", "do Dragão", "da Serpente", "do Cavalo", "da Cabra", "do Macaco", "do Galo", "do Cão", "do Porco"],
  },
  fr: {
    stem: romanStem, branch: romanBranch,
    element: ["Bois", "Feu", "Terre", "Métal", "Eau"], yin: "Yin", yang: "Yang",
    god: ["Compagnon", "Rival", "Dieu nourricier", "Officier blessant", "Richesse indirecte", "Richesse directe", "Sept tueurs", "Officier direct", "Ressource indirecte", "Ressource directe"],
    group: ["Pairs", "Expression", "Richesse", "Autorité", "Ressource"],
    pillar: ["Heure", "Jour", "Mois", "Année"], me: "moi",
    stemSeat: ["Tronc de l’heure", "Tronc du jour", "Tronc du mois", "Tronc de l’année"],
    branchSeat: ["Branche de l’heure", "Branche du jour", "Branche du mois", "Branche de l’année"],
    row: ["Dieu", "Tronc", "Branche", "Caché", "Phase", "Astre"],
    stage: ["Naissance", "Bain", "Couronne", "Charge", "Apogée", "Déclin", "Maladie", "Mort", "Tombe", "Rupture", "Germe", "Éveil"],
    spirit: ["Rapt", "Péril", "Ciel", "Sol", "Charme", "Lune", "Exposition", "Général", "Selle", "Voyage", "Six torts", "Dais"],
    relation: ["Union des troncs", "Choc des troncs", "Union saisonnière", "Triple union", "Demi-union", "Union des six", "Choc", "Punition", "Autopunition", "Union", "Neutre"],
    solarTerm: ["Début du printemps", "Éveil des insectes", "Pure clarté", "Début de l’été", "Grains en épi", "Petite chaleur", "Début de l’automne", "Rosée blanche", "Rosée froide", "Début de l’hiver", "Grande neige", "Petit froid"],
    strength: ["Faible", "Équilibré", "Fort"],
    animal: ["du Rat", "du Bœuf", "du Tigre", "du Lapin", "du Dragon", "du Serpent", "du Cheval", "de la Chèvre", "du Singe", "du Coq", "du Chien", "du Cochon"],
  },
  ru: {
    stem: romanStem, branch: romanBranch,
    element: ["Дерево", "Огонь", "Земля", "Металл", "Вода"], yin: "Инь", yang: "Ян",
    god: ["Равный", "Соперник", "Дух пищи", "Ранящий чиновник", "Косвенное богатство", "Прямое богатство", "Семь убийц", "Прямой чиновник", "Косвенная опора", "Прямая опора"],
    group: ["Равные", "Самовыражение", "Богатство", "Власть", "Опора"],
    pillar: ["Час", "День", "Месяц", "Год"], me: "я",
    stemSeat: ["Ствол часа", "Ствол дня", "Ствол месяца", "Ствол года"],
    branchSeat: ["Ветвь часа", "Ветвь дня", "Ветвь месяца", "Ветвь года"],
    row: ["Дух", "Ствол", "Ветвь", "Скрыт.", "Этап", "Звезда"],
    stage: ["Рождение", "Купание", "Венец", "Служба", "Расцвет", "Спад", "Болезнь", "Смерть", "Могила", "Обрыв", "Зачатие", "Рост"],
    spirit: ["Грабёж", "Угроза", "Небо", "Земля", "Обаяние", "Луна", "Огласка", "Генерал", "Седло", "Дорога", "Шесть бед", "Балдахин"],
    relation: ["Слияние стволов", "Столкновение стволов", "Сезонное слияние", "Тройное слияние", "Полуслияние", "Шестерное слияние", "Столкновение", "Наказание", "Самонаказание", "Слияние", "Ровно"],
    solarTerm: ["Начало весны", "Пробуждение насекомых", "Ясность и свет", "Начало лета", "Колошение хлебов", "Малая жара", "Начало осени", "Белые росы", "Холодные росы", "Начало зимы", "Большой снег", "Малые холода"],
    strength: ["Слабая", "Ровная", "Сильная"],
    animal: ["Крысы", "Быка", "Тигра", "Кролика", "Дракона", "Змеи", "Лошади", "Козы", "Обезьяны", "Петуха", "Собаки", "Свиньи"],
  },
  mn: {
    stem: romanStem, branch: romanBranch,
    element: ["Мод", "Гал", "Шороо", "Төмөр", "Ус"], yin: "Инь", yang: "Ян",
    god: ["Тэнцүү нөхөр", "Өрсөлдөгч", "Хүнсний шүтээн", "Эрхийг сөрөгч", "Шууд бус баялаг", "Шууд баялаг", "Долоон сорилт", "Шууд эрх мэдэл", "Шууд бус түшиг", "Шууд түшиг"],
    group: ["Тэнцүү нөхөд", "Илэрхийлэл", "Баялаг", "Эрх мэдэл", "Түшиг"],
    pillar: ["Цаг", "Өдөр", "Сар", "Жил"], me: "би",
    stemSeat: ["Цагийн иш", "Өдрийн иш", "Сарын иш", "Жилийн иш"],
    branchSeat: ["Цагийн мөчир", "Өдрийн мөчир", "Сарын мөчир", "Жилийн мөчир"],
    row: ["Шүтээн", "Иш", "Мөчир", "Далд", "Үе", "Од"],
    stage: ["Төрөлт", "Угаал", "Титэм", "Алба", "Оргил", "Буурал", "Өвчин", "Төгсгөл", "Булш", "Тасралт", "Үр", "Тэжээл"],
    spirit: ["Дээрэм", "Гамшиг", "Тэнгэр", "Газар", "Сэтгэл татам", "Сар", "Ил болох", "Жанжин", "Эмээл", "Аян", "Зургаан хор", "Шүхэр"],
    relation: ["Ишийн нийлэл", "Ишийн мөргөлдөөн", "Улирлын нийлэл", "Гурвалсан нийлэл", "Хагас нийлэл", "Зургаан нийлэл", "Мөргөлдөөн", "Шийтгэл", "Өөрийн шийтгэл", "Нийлэл", "Тогтуун"],
    solarTerm: ["Хаврын эхлэл", "Шавьж сэрэх", "Тод цэлмэг", "Зуны эхлэл", "Тариа түрүүлэх", "Бага халуун", "Намрын эхлэл", "Цагаан шүүдэр", "Хүйтэн шүүдэр", "Өвлийн эхлэл", "Их цас", "Бага хүйтэн"],
    strength: ["Сул", "Тэнцвэртэй", "Хүчтэй"],
    animal: ["Хулгана", "Үхэр", "Бар", "Туулай", "Луу", "Могой", "Морь", "Хонь", "Бич", "Тахиа", "Нохой", "Гахай"],
  },
};

const elementOrder: readonly Element[] = ["wood", "fire", "earth", "metal", "water"];
const pillarOrder: readonly PillarKey[] = ["hour", "day", "month", "year"];
const strengthOrder: readonly StrengthClass[] = ["신약", "중화", "신강"];

/** 한 언어의 용어를 계산 값(한글 키)으로 찾는 표. */
export type SajuTerms = ReturnType<typeof sajuTerms>;
export function sajuTerms(locale: TermLocale) {
  const w = words[locale];
  const stemWord = (stem: Stem) => w.stem[stems.indexOf(stem)] ?? "";
  const branchWord = (branch: Branch) => w.branch[branches.indexOf(branch)] ?? "";
  const pillarRead = (stem: Stem, branch: Branch) => {
    if (!stemWord(stem)) return `${stemHanja[stem]}${branchHanja[branch]}`;
    return locale === "vi" ? `${stemWord(stem)} ${branchWord(branch)}` : `${stemWord(stem)}-${branchWord(branch)}`;
  };
  return {
    element: (element: Element) => w.element[elementOrder.indexOf(element)],
    yinYang: (stem: Stem) => (stems.indexOf(stem) % 2 === 0 ? w.yang : w.yin),
    god: (god: TenGod) => w.god[tenGods.indexOf(god)],
    group: (group: TenGodGroup) => w.group[tenGodGroups.indexOf(group)],
    pillar: (key: PillarKey) => w.pillar[pillarOrder.indexOf(key)],
    me: w.me,
    stemSeat: (key: PillarKey) => w.stemSeat[pillarOrder.indexOf(key)],
    branchSeat: (key: PillarKey) => w.branchSeat[pillarOrder.indexOf(key)],
    row: w.row,
    stage: (name: string) => w.stage[lifeStages.indexOf(name as (typeof lifeStages)[number])] ?? name,
    spirit: (name: string) => w.spirit[spiritStars.indexOf(name as (typeof spiritStars)[number])] ?? name,
    relation: (kind: RelationWord) => w.relation[relationKinds.indexOf(kind)],
    solarTerm: (name: string) => w.solarTerm[monthTerms.indexOf(name as (typeof monthTerms)[number])] ?? name,
    strength: (name: StrengthClass) => w.strength[strengthOrder.indexOf(name)],
    animal: (branch: Branch) => w.animal[branches.indexOf(branch)],
    /** 기둥 두 글자 읽기: Byeong-o · Bính Ngọ (읽기가 없는 언어는 丙午). 운세 일진처럼 표 없이 이름만 적는 곳에 쓴다. */
    pillarRead,
    /** 명식표 옆에서 부르는 이름: 丙午 Byeong-o (읽기가 없는 언어는 丙午). */
    pillarName: (stem: Stem, branch: Branch) => {
      const hanja = `${stemHanja[stem]}${branchHanja[branch]}`;
      const read = pillarRead(stem, branch);
      return read === hanja ? hanja : `${hanja} ${read}`;
    },
  };
}

/** 한글 두 글자 기둥 이름(갑진)을 선택 언어로. 한국어와 모르는 글자는 그대로 둔다. */
export function pillarLabel(value: string, locale: AppLocale) {
  const [stem, branch] = [...value] as [Stem, Branch];
  if (locale === "ko" || value.length !== 2 || !stems.includes(stem) || !branches.includes(branch)) return value;
  return sajuTerms(locale).pillarRead(stem, branch);
}
