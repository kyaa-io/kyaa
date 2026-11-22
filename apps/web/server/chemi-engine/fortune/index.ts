import "server-only";

import weights from "./weights.json";
import { SunPosition } from "astronomy-engine";
import { balanceElements, elements as elementKeys, type Chart as SajuChart } from "@/app/chemi/saju/chart";
/** v55 04-3: persisted readings must retain their original table version. */
export const FORTUNE_TABLE_VERSION = weights.version;
export const FORTUNE_GRADES = [
  { min: 50, max: 59, name: "쉬어 가는 날" },
  { min: 60, max: 69, name: "조심하면 괜찮은 날" },
  { min: 70, max: 79, name: "무난한 날" },
  { min: 80, max: 89, name: "좋은 날" },
  { min: 90, max: 98, name: "아주 좋은 날" },
] as const;

export function fortuneGrade(score: number) {
  if (!Number.isInteger(score) || score < 50 || score > 98) {
    throw new RangeError("Fortune score must be an integer from 50 through 98");
  }
  return FORTUNE_GRADES.find((grade) => score <= grade.max)!;
}

const stems = "갑을병정무기경신임계";
const branches = "자축인묘진사오미신유술해";
const elements = "목화토금수";
const branchElements = [4,2,0,0,2,1,1,2,3,3,2,4];
const stageStart = [11,6,2,9,2,9,5,0,8,3];
const stages = "장생 목욕 관대 건록 제왕 쇠 병 사 묘 절 태 양".split(" ");
const spirits = "겁살 재살 천살 지살 년살 월살 망신살 장성살 반안살 역마살 육해살 화개살".split(" ");
const gods = ["비견 겁재","식신 상관","편재 정재","편관 정관","편인 정인"];
const luck = [
  ["초록",3,"동","나무 연필"], ["빨강",2,"남","빨간 펜"], ["노랑",5,"중앙","도자기 컵"],
  ["하양",4,"서","금속 책갈피"], ["검정",1,"북","물병"],
] as const;
type Pillar = { heavenlyStem: string; earthlyBranch: string };
type Chart = { pillars: { day: Pillar; year: Pillar | null; month: Pillar | null; hour: Pillar | null }; gender?: "male" | "female" };
const mod = (n: number, m: number) => ((n % m) + m) % m;
const clamp = (score: number) => Math.max(50, Math.min(98, score));

function index(symbols: string, value: string) {
  if (value.length !== 1 || !symbols.includes(value)) throw new RangeError("올바르지 않은 간지");
  return symbols.indexOf(value);
}

function relation(a: number, b: number, natal: readonly number[] = []): keyof typeof weights.relation {
  const diff = mod(a-b,12);
  if (mod(a+b,12) === 1) return "육합";
  if (diff === 6) return "충";
  if (diff === 4 || diff === 8) return natal.includes(mod(2*b-a,12)) ? "삼합" : "반합";
  const pair = [a,b].sort((x,y) => x-y).join(",");
  if (["0,3","2,5","2,8","5,8","1,10","1,7","7,10","4,4","6,6","9,9","11,11"].includes(pair)) return "형";
  if (mod(a+b,12) === 7) return "해";
  if (["0,7","1,6","2,9","3,8","4,11","5,10"].includes(pair)) return "원진";
  return a === b ? "복음" : "없음";
}

function daytimeHour(branch: number) {
  const start = branch * 2 - 1;
  return start >= 5 && start < 21 ? {start, end: start+2} : null;
}

/** kstDate is the selected Korean reading day, independent of the viewing time. */
export function computeDailyFortune(chart: Chart, readingDay: string | Date) {
  // An instant rolls over at 23:00 Seoul mean solar time (KST minus 30 min).
  // A selected date already denotes a reading day, so apply no second rollover.
  const kstDate = typeof readingDay === "string" ? readingDay :
    new Date(readingDay.getTime() + (9 * 60 + 30) * 60000).toISOString().slice(0,10);
  const date = new Date(kstDate + "T03:00:00Z"); // noon in Seoul
  if (!/^\d{4}-\d{2}-\d{2}$/.test(kstDate) || !Number.isFinite(+date) || date.toISOString().slice(0,10) !== kstDate)
    throw new RangeError("한국 날짜는 YYYY-MM-DD 형식이어야 합니다");
  // 2000-01-07 = 갑자. Use a civil day difference, independent of host time zone.
  const cycle = mod((+date-Date.UTC(2000,0,7,3))/86400000,60);
  const stem = cycle % 10, branch = cycle % 12;
  const { day, year, month, hour } = chart.pillars;
  if (!month || !year) return { locked: true, reason: "시간을 알면 열려요", dayPillar: stems[stem]+branches[branch] } as const;
  const master = index(stems,day.heavenlyStem);
  const natalBranch = index(branches,day.earthlyBranch);
  const self = Math.floor(master/2);
  const pillars = hour ? [day,year,month,hour] : [day,year,month];
  const natal = pillars.map(p => index(branches,p.earthlyBranch));
  const strength = pillars.flatMap((p,i) => [Math.floor(index(stems,p.heavenlyStem)/2),branchElements[natal[i]]]);
  strength.push(branchElements[natal[2]]); // month branch carries seasonal weight (field balance)
  // 도움·보조·부담 기운은 사주 화면과 같은 함수(신강 지수 기반 억부)로 고른다.
  const lean = balanceElements({ pillars: { year, month, day, hour } } as SajuChart)!;
  const [useful, supportive, adverse] = [lean.useful, lean.supportive, lean.adverse].map(e => elementKeys.indexOf(e));
  const affinity = (e: number) => e === useful ? weights.useful : e === supportive ? weights.supportive : e === adverse ? weights.adverse : 0;
  const stage = mod((branch-stageStart[master])*(master%2 ? -1 : 1),12);
  const tie = relation(natalBranch,branch,natal);
  const longitude = SunPosition(date).elon;
  const solarYear = date.getUTCFullYear() - Number(date.getUTCMonth() < 2 && longitude < 315 && longitude > 260);
  const yearCycle = mod(solarYear-4,60);
  const annual = affinity(Math.floor(yearCycle%10/2)) + affinity(branchElements[yearCycle%12]);
  const score = clamp(Math.max(50 + (annual > 0 ? weights.annualFloorBonus : 0),
    weights.base + affinity(Math.floor(stem/2)) + affinity(branchElements[branch]) + weights.relation[tie] + weights.stage[stage]));
  const group = mod(Math.floor(stem/2)-self,5);
  const field = (target: number) => {
    if (target < 0) return score;
    // Compare the field's element with both the reading day and natal chart.
    const element = (self + target) % 5;
    const branchGroup = mod(branchElements[branch] - self, 5);
    const natalCount = strength.filter(value => value === element).length;
    const balance = strength.length / 5 - natalCount;
    const adjustment = weights.fieldCycle[mod(target - group, 5)]
      + weights.branchCycle[mod(target - branchGroup, 5)] + Math.round(balance);
    return clamp(score + adjustment);
  };
  const period = (b: number) => clamp(score + weights.relation[relation(natalBranch,b)] + affinity(branchElements[b]));
  const [color,number,direction,item] = luck[useful];
  return { locked: false, tableVersion: FORTUNE_TABLE_VERSION, score, grade: fortuneGrade(score),
    fields: { love: field(chart.gender === "male" ? 2 : chart.gender === "female" ? 3 : -1), money: field(2), work: field(3), rest: field(4), people: field(0), fandom: field(1) },
    periods: { morning: period(4), afternoon: period(7), night: period(10) },
    luck: { color,number,direction,item, luckyHour: daytimeHour(mod(1-natalBranch,12)), restHour: daytimeHour((natalBranch+6)%12) },
    evidence: { dayPillar: stems[stem]+branches[branch], yearPillar: stems[yearCycle%10]+branches[yearCycle%12],
      relation: tie, stage: stages[stage], spirit: spirits[mod(branch-[5,2,11,8][natal[1]%4],12)],
      tenGod: gods[group].split(" ")[(master+stem)%2], useful: elements[useful], supportive: elements[supportive], adverse: elements[adverse],
      timeBasis: hour ? "시주 포함" : "시간 모름으로 계산" },
  } as const;
}
