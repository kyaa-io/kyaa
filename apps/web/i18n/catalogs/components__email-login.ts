import type { AppLocale } from "../locales";
const rows: Record<AppLocale, readonly [string, string, string, string, string, string]> = {
  ko: ["이메일로 계속하기", "이메일", "비밀번호", "로그인", "로그인 중", "로그인하지 못했어요. 이메일과 비밀번호를 확인한 뒤 다시 시도해 주세요."],
  en: ["Continue with email", "Email", "Password", "Sign in", "Signing in", "Couldn't sign in. Check your email and password and try again."],
  ja: ["メールで続ける", "メールアドレス", "パスワード", "ログイン", "ログイン中", "ログインできませんでした。メールアドレスとパスワードを確認して、もう一度お試しください。"],
  "zh-Hans": ["使用邮箱继续", "邮箱", "密码", "登录", "正在登录", "无法登录。请检查邮箱和密码后重试。"],
  "zh-Hant": ["使用電子郵件繼續", "電子郵件", "密碼", "登入", "登入中", "無法登入。請確認電子郵件和密碼後重試。"],
  es: ["Continuar con correo", "Correo electrónico", "Contraseña", "Iniciar sesión", "Iniciando sesión", "No se pudo iniciar sesión. Revisa tu correo y contraseña e inténtalo de nuevo."],
  id: ["Lanjutkan dengan email", "Email", "Kata sandi", "Masuk", "Sedang masuk", "Tidak dapat masuk. Periksa email dan kata sandi, lalu coba lagi."],
  vi: ["Tiếp tục bằng email", "Email", "Mật khẩu", "Đăng nhập", "Đang đăng nhập", "Không thể đăng nhập. Hãy kiểm tra email và mật khẩu rồi thử lại."],
  th: ["ดำเนินการต่อด้วยอีเมล", "อีเมล", "รหัสผ่าน", "เข้าสู่ระบบ", "กำลังเข้าสู่ระบบ", "เข้าสู่ระบบไม่ได้ โปรดตรวจสอบอีเมลและรหัสผ่านแล้วลองอีกครั้ง"],
  pt: ["Continuar com email", "Email", "Senha", "Entrar", "Entrando", "Não foi possível entrar. Confira seu email e senha e tente novamente."],
  ru: ["Продолжить с почтой", "Электронная почта", "Пароль", "Войти", "Вход", "Не удалось войти. Проверьте почту и пароль и попробуйте снова."],
  fr: ["Continuer avec un e-mail", "E-mail", "Mot de passe", "Se connecter", "Connexion en cours", "Connexion impossible. Vérifiez votre e-mail et votre mot de passe, puis réessayez."],
};
export const emailLoginCopy = (locale: AppLocale) => rows[locale];
