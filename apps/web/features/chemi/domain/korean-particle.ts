/** 마지막 글자가 한글 받침으로 끝나는지. 한글이 아니면 null. */
function hasFinalConsonant(word: string) {
  const last = word.trim().slice(-1).charCodeAt(0);
  if (!(last >= 0xac00 && last <= 0xd7a3)) return null;
  return (last - 0xac00) % 28 !== 0;
}

/** 주제 조사 `은`·`는`. 받침이 있으면 `은`, 없거나 한글이 아니면 `는`. */
export function topicParticle(word: string) {
  return hasFinalConsonant(word) ? "은" : "는";
}

/** `내일 운세` → `내일 운세는`, `특별 부적 만들기` → `특별 부적 만들기는`, `지난 기록` → `지난 기록은`. */
export function withTopic(word: string) {
  return `${word}${topicParticle(word)}`;
}
