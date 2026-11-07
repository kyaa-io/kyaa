// 세션 확인이 끝나기 전에 "로그인 회원일 수 있는지"를 답한다. 차단한 작성자의 글처럼 회원 읽기에서만 걸러지는 값을
// 공개 응답으로 잠깐이라도 그리지 않기 위한 표시다. 권한 판단에 쓰지 않는다. 표시가 낡아도 골격이 조금 더 보일 뿐이다.
export const SESSION_HINT_KEY = "kyaa:session-hint";
const WALLET_TOKEN_KEY = "privy:token";

export function mayHaveSession(): boolean {
  try { return localStorage.getItem(SESSION_HINT_KEY) === "1" || localStorage.getItem(WALLET_TOKEN_KEY) !== null; }
  catch { return false; }
}

export function rememberSession(present: boolean) {
  try {
    if (present) localStorage.setItem(SESSION_HINT_KEY, "1");
    else localStorage.removeItem(SESSION_HINT_KEY);
  } catch { /* 저장소가 막힌 기기는 표시 없이 동작한다. */ }
}
