import type { AppLocale } from "@/i18n/locales";

type Copy = Readonly<{ switchAccount: string; current: string; signsOut: string; otherAccount: string; switchedTo: (name: string) => string; switched: string }>;

/** ACCOUNT-SWITCH-PLAN-1124 12-language draft (switch / current), plus the confirm button, the sign-out line and the result toast. */
const COPY: Record<AppLocale, Copy> = {
  ko: { switchAccount: "계정 전환", current: "현재 계정", signsOut: "이 계정은 로그아웃돼요.", otherAccount: "다른 계정으로 로그인", switchedTo: name => `${name} 계정으로 전환했어요`, switched: "계정을 전환했어요" },
  en: { switchAccount: "Switch account", current: "Current account", signsOut: "You'll be signed out of this account.", otherAccount: "Log in with another account", switchedTo: name => `Switched to ${name}`, switched: "Switched accounts" },
  ja: { switchAccount: "アカウントを切り替える", current: "現在のアカウント", signsOut: "このアカウントからログアウトします。", otherAccount: "別のアカウントでログイン", switchedTo: name => `${name}に切り替えました`, switched: "アカウントを切り替えました" },
  "zh-Hans": { switchAccount: "切换账号", current: "当前账号", signsOut: "将退出此账号。", otherAccount: "使用其他账号登录", switchedTo: name => `已切换到 ${name}`, switched: "已切换账号" },
  "zh-Hant": { switchAccount: "切換帳號", current: "目前帳號", signsOut: "將登出此帳號。", otherAccount: "使用其他帳號登入", switchedTo: name => `已切換為 ${name}`, switched: "已切換帳號" },
  es: { switchAccount: "Cambiar de cuenta", current: "Cuenta actual", signsOut: "Se cerrará la sesión de esta cuenta.", otherAccount: "Iniciar sesión con otra cuenta", switchedTo: name => `Cambiaste a ${name}`, switched: "Cambiaste de cuenta" },
  id: { switchAccount: "Ganti akun", current: "Akun saat ini", signsOut: "Anda akan keluar dari akun ini.", otherAccount: "Masuk dengan akun lain", switchedTo: name => `Beralih ke ${name}`, switched: "Akun diganti" },
  vi: { switchAccount: "Chuyển tài khoản", current: "Tài khoản hiện tại", signsOut: "Bạn sẽ đăng xuất khỏi tài khoản này.", otherAccount: "Đăng nhập bằng tài khoản khác", switchedTo: name => `Đã chuyển sang ${name}`, switched: "Đã chuyển tài khoản" },
  th: { switchAccount: "สลับบัญชี", current: "บัญชีปัจจุบัน", signsOut: "ระบบจะออกจากบัญชีนี้", otherAccount: "เข้าสู่ระบบด้วยบัญชีอื่น", switchedTo: name => `สลับเป็น ${name} แล้ว`, switched: "สลับบัญชีแล้ว" },
  pt: { switchAccount: "Alternar conta", current: "Conta atual", signsOut: "Você sairá desta conta.", otherAccount: "Entrar com outra conta", switchedTo: name => `Você mudou para ${name}`, switched: "Conta alterada" },
  fr: { switchAccount: "Changer de compte", current: "Compte actuel", signsOut: "Vous serez déconnecté de ce compte.", otherAccount: "Se connecter avec un autre compte", switchedTo: name => `Vous êtes passé à ${name}`, switched: "Compte changé" },
  ru: { switchAccount: "Сменить аккаунт", current: "Текущий аккаунт", signsOut: "Вы выйдете из этого аккаунта.", otherAccount: "Войти в другой аккаунт", switchedTo: name => `Вы перешли в аккаунт ${name}`, switched: "Аккаунт сменён" },
  mn: { switchAccount: "Бүртгэл солих", current: "Одоогийн бүртгэл", signsOut: "Энэ бүртгэлээс гарна.", otherAccount: "Өөр бүртгэлээр нэвтрэх", switchedTo: name => `${name} бүртгэл рүү шилжлээ`, switched: "Бүртгэл солигдлоо" },
};

export function accountSwitchCopy(locale: AppLocale): Copy { return COPY[locale] ?? COPY.en; }
