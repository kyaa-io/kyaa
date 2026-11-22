/** 마지막 글자 받침에 맞춰 조사를 붙인다. 한글이 아니면 앞쪽 조사를 쓴다. */
const pairs = { 은는: ["은", "는"], 과와: ["과", "와"], 이가: ["이", "가"], 을를: ["을", "를"], 이랑: ["이랑", "랑"] } as const;

function hasFinalConsonant(text: string) {
  // 괄호 풀이는 읽지 않는다: "네 달(게자리)과" 는 '달'의 받침을 본다(승인 시안 05-3).
  const last = text.replace(/\([^)]*\)\s*$/, "").trimEnd().slice(-1);
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return false;
  return (code - 0xac00) % 28 !== 0;
}

export function withParticle(text: string, pair: keyof typeof pairs) {
  const [withFinal, without] = pairs[pair];
  return `${text}${hasFinalConsonant(text) ? withFinal : without}`;
}
