import type { AppLocale } from "./locales";

export const growthSignupCopy = {
  ko: { google: "브라우저에서 Google로 계속", hint: "로그인하면 추첨에 응모할 수 있어요", enter: "무료 응모하기" },
  en: { google: "Continue with Google in browser", hint: "Sign in to enter the draw", enter: "Enter free" },
  ja: { google: "ブラウザで Google で続ける", hint: "ログインして抽選に応募", enter: "無料で応募" },
  "zh-Hans": { google: "在浏览器中使用 Google 继续", hint: "登录即可参加抽奖", enter: "免费参加抽奖" },
  "zh-Hant": { google: "在瀏覽器中使用 Google 繼續", hint: "登入即可參加抽獎", enter: "免費參加抽獎" },
  es: { google: "Continuar con Google en el navegador", hint: "Inicia sesión para entrar en el sorteo", enter: "Participa gratis" },
  id: { google: "Lanjut dengan Google di browser", hint: "Masuk untuk ikut undian", enter: "Ikut undian gratis" },
  vi: { google: "Tiếp tục với Google trong trình duyệt", hint: "Đăng nhập để tham gia bốc thăm", enter: "Tham gia miễn phí" },
  th: { google: "ดำเนินการต่อด้วย Google ในเบราว์เซอร์", hint: "เข้าสู่ระบบเพื่อร่วมลุ้นรางวัล", enter: "ร่วมลุ้นฟรี" },
  pt: { google: "Continuar com Google no navegador", hint: "Entre na sua conta para participar do sorteio", enter: "Participe grátis" },
  fr: { google: "Continuer avec Google dans le navigateur", hint: "Connectez-vous pour participer au tirage", enter: "Participer gratuitement" },
  ru: { google: "Продолжить с Google в браузере", hint: "Войдите, чтобы участвовать в розыгрыше", enter: "Участвовать бесплатно" },
  mn: { google: "Continue with Google in browser", hint: "Сугалаанд оролцохын тулд нэвтэрнэ үү", enter: "Үнэгүй оролцох" },
} satisfies Record<AppLocale, { google: string; hint: string; enter: string }>;
