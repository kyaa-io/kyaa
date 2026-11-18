import "server-only";
import { createHmac } from "node:crypto";

// 상대 지문(설계 r4b §5.2): "fp:" + HMAC-SHA256(사용자별 소금, birth_date|calendar|birth_time|time_precision|gender) 앞 32자.
// 장소·별명은 넣지 않는다(장소만 바뀐 상대는 같은 상대다). 소금은 chemi_fp_salt 가 돌려주는 64자 hex.
// 궁합 풀이의 target_key 도 같은 함수로 만들어야 상대 고치기·지우기가 그 줄을 찾는다.
export interface ChemiFingerprintInput {
  birthDate: string;
  calendar: string;
  birthTime: string | null;
  timePrecision: string;
  gender: string | null;
}

export function chemiPartnerFingerprint(saltHex: string, input: ChemiFingerprintInput) {
  if (!/^[0-9a-f]{64}$/.test(saltHex)) throw new Error("CHEMI_UNAVAILABLE");
  const message = [input.birthDate, input.calendar, input.birthTime ?? "", input.timePrecision, input.gender ?? ""].join("|");
  return `fp:${createHmac("sha256", Buffer.from(saltHex, "hex")).update(message, "utf8").digest("hex").slice(0, 32)}`;
}
