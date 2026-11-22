/** 닉네임을 정하지 않은 회원의 랭킹 이름. 다른 랭킹 SQL(coalesce(nickname, '팬' | 'Fan'))과 같은 규칙. */
export function rankName(nickname: string | null | undefined, locale: string) {
  return nickname?.trim() || (locale === "ko" ? "팬" : "Fan");
}
