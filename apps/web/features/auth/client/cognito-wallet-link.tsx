"use client";
import { useCreateWallet, useLinkJwtAccount, useLoginWithOAuth, usePrivy, useUser } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams,useRouter } from "next/navigation";
import type { Route } from "next";
import { useCognitoAuth } from "./cognito-auth";
import { usePageLocale } from "../../../components/locale-provider";
import { appendLoginContext, sanitizeAuthIntentId, sanitizeEntity, sanitizeIntent, sanitizeReturnTo } from "../../../components/login-intent";
import styles from "../../../components/login-page.module.css";
import { AppleMark, ArrowRight, GoogleMark } from "../../../components/icons";
import pageStyles from "./cognito-auth-pages.module.css";
import { withOperationDeadline } from "../../reliability/client/request-deadline";

const labels={
  ko:["기존 지갑 연결","사용하던 Google 또는 Apple 계정으로 다시 로그인해 기존 계정과 지갑을 확인해 주세요.","Google로 확인","Apple로 확인","계정을 확인하고 있어요.","계정을 연결하지 못했어요. 다시 시도해 주세요.","이메일로만 가입했다면 기존 앱의 이메일 로그인을 이용해 주세요. 다른 계정으로 새 지갑을 만들지 마세요.","로그인으로 돌아가기"],
  en:["Connect your existing wallet","Sign in again with your existing Google or Apple account to confirm your account and wallet.","Verify with Google","Verify with Apple","Verifying your account…","We couldn't link your account. Please try again.","If you signed up with email only, use email sign-in in the existing app. Do not create another wallet with a different account.","Back to sign in"],
  ja:["既存のウォレットを連携","これまでのGoogleまたはAppleアカウントで再ログインし、アカウントとウォレットを確認してください。","Googleで確認","Appleで確認","アカウントを確認中…","連携できませんでした。もう一度お試しください。","メールのみで登録した場合は、既存アプリのメールログインをご利用ください。別のアカウントで新しいウォレットを作らないでください。","ログインに戻る"],
  "zh-Hans":["关联现有钱包","请使用原来的Google或Apple账号重新登录，确认账号和钱包。","通过Google验证","通过Apple验证","正在验证账号…","无法关联账号，请重试。","如果仅通过邮箱注册，请使用现有应用中的邮箱登录。请勿使用其他账号创建新钱包。","返回登录"],
  "zh-Hant":["連結現有錢包","請使用原本的Google或Apple帳號重新登入，確認帳號和錢包。","透過Google驗證","透過Apple驗證","正在驗證帳號…","無法連結帳號，請重試。","若僅透過電子郵件註冊，請使用現有應用程式中的電子郵件登入。請勿使用其他帳號建立新錢包。","返回登入"],
  es:["Vincula tu cartera actual","Vuelve a iniciar sesión con tu cuenta habitual de Google o Apple para verificar tu cuenta y cartera.","Verificar con Google","Verificar con Apple","Verificando tu cuenta…","No se pudo vincular la cuenta. Inténtalo de nuevo.","Si te registraste solo con correo, inicia sesión por correo en la aplicación actual. No crees otra cartera con una cuenta diferente.","Volver a iniciar sesión"],
  id:["Hubungkan dompet yang sudah ada","Masuk kembali dengan akun Google atau Apple yang biasa digunakan untuk memverifikasi akun dan dompet.","Verifikasi dengan Google","Verifikasi dengan Apple","Memverifikasi akun…","Akun tidak dapat dihubungkan. Coba lagi.","Jika mendaftar hanya dengan email, gunakan login email di aplikasi yang ada. Jangan membuat dompet baru dengan akun lain.","Kembali ke login"],
  vi:["Liên kết ví hiện có","Đăng nhập lại bằng tài khoản Google hoặc Apple hiện có để xác minh tài khoản và ví.","Xác minh với Google","Xác minh với Apple","Đang xác minh tài khoản…","Không thể liên kết tài khoản. Vui lòng thử lại.","Nếu chỉ đăng ký bằng email, hãy đăng nhập bằng email trong ứng dụng hiện tại. Không tạo ví mới bằng tài khoản khác.","Quay lại đăng nhập"],
  th:["เชื่อมต่อกระเป๋าเงินเดิม","เข้าสู่ระบบอีกครั้งด้วยบัญชี Google หรือ Apple เดิมเพื่อยืนยันบัญชีและกระเป๋าเงิน","ยืนยันด้วย Google","ยืนยันด้วย Apple","กำลังยืนยันบัญชี…","เชื่อมต่อบัญชีไม่สำเร็จ โปรดลองอีกครั้ง","หากสมัครด้วยอีเมลเท่านั้น ให้เข้าสู่ระบบด้วยอีเมลในแอปเดิม อย่าสร้างกระเป๋าเงินใหม่ด้วยบัญชีอื่น","กลับไปเข้าสู่ระบบ"],
  pt:["Associar a carteira existente","Inicie sessão novamente com a sua conta habitual Google ou Apple para verificar a conta e a carteira.","Verificar com Google","Verificar com Apple","A verificar a conta…","Não foi possível associar a conta. Tente novamente.","Se se registou apenas com e-mail, use o início de sessão por e-mail na aplicação atual. Não crie outra carteira com uma conta diferente.","Voltar ao início de sessão"],
  fr:["Associer le portefeuille existant","Reconnectez-vous avec votre compte Google ou Apple habituel pour vérifier votre compte et votre portefeuille.","Vérifier avec Google","Vérifier avec Apple","Vérification du compte…","Impossible d’associer le compte. Réessayez.","Si vous vous êtes inscrit uniquement par e-mail, utilisez la connexion par e-mail dans l’application existante. Ne créez pas un autre portefeuille avec un compte différent.","Retour à la connexion"],
};
const sessionLabels={
  ko:["로그인 정보를 확인하고 있어요.","로그인 정보가 없거나 만료됐어요. 로그인으로 돌아가 다시 시작해 주세요.","계정 연결을 진행할 수 없어요. 기존 앱의 로그인을 이용하거나 지원팀에 문의해 주세요."],
  en:["Checking your sign-in…","Your sign-in is missing or has expired. Return to sign in and try again.","Account linking is unavailable. Sign in through the existing app or contact support."],
  ja:["ログイン情報を確認しています。","ログイン情報がないか、有効期限が切れています。ログイン画面からやり直してください。","アカウントを連携できません。既存アプリからログインするか、サポートにお問い合わせください。"],
  "zh-Hans":["正在检查登录信息…","登录信息不存在或已过期，请返回登录并重试。","暂时无法关联账号，请通过现有应用登录或联系支持团队。"],
  "zh-Hant":["正在確認登入資訊…","登入資訊不存在或已過期，請返回登入並重試。","目前無法連結帳號，請透過現有應用程式登入或聯絡支援團隊。"],
  es:["Comprobando el inicio de sesión…","No hay una sesión o ha caducado. Vuelve a iniciar sesión.","No se puede vincular la cuenta. Inicia sesión desde la aplicación actual o contacta con soporte."],
  id:["Memeriksa login…","Sesi login tidak ada atau telah berakhir. Kembali dan masuk lagi.","Akun tidak dapat dihubungkan. Masuk melalui aplikasi yang ada atau hubungi dukungan."],
  vi:["Đang kiểm tra đăng nhập…","Phiên đăng nhập không tồn tại hoặc đã hết hạn. Vui lòng quay lại đăng nhập.","Không thể liên kết tài khoản. Hãy đăng nhập qua ứng dụng hiện tại hoặc liên hệ hỗ trợ."],
  th:["กำลังตรวจสอบการเข้าสู่ระบบ…","ไม่พบข้อมูลการเข้าสู่ระบบหรือหมดอายุแล้ว โปรดกลับไปเข้าสู่ระบบอีกครั้ง","ไม่สามารถเชื่อมต่อบัญชีได้ โปรดเข้าสู่ระบบผ่านแอปเดิมหรือติดต่อฝ่ายสนับสนุน"],
  pt:["A verificar o início de sessão…","A sessão não existe ou expirou. Volte a iniciar sessão.","Não é possível associar a conta. Inicie sessão na aplicação atual ou contacte o suporte."],
  fr:["Vérification de la connexion…","La session est absente ou a expiré. Revenez à la connexion et réessayez.","L’association du compte est indisponible. Connectez-vous dans l’application existante ou contactez l’assistance."],
};
const MARKER="kyaa-cognito-wallet-reauth";
export function CognitoWalletLink({appleLoginEnabled}:{appleLoginEnabled:boolean}){
  const locale=usePageLocale(),copy=labels[locale];
  const query=useSearchParams(),auth=useCognitoAuth(),router=useRouter();
  const loginHref=appendLoginContext("/login",{returnTo:sanitizeReturnTo(query.get("returnTo")),locale,intent:sanitizeIntent(query.get("intent")),entity:sanitizeEntity(query.get("entity")),authIntent:sanitizeAuthIntentId(query.get("authIntent"))});
  const {ready,authenticated,getAccessToken,logout}=usePrivy();
  const {initOAuth}=useLoginWithOAuth();const {linkWithCustomJwt}=useLinkJwtAccount();
  const {createWallet}=useCreateWallet(),{refreshUser}=useUser();
  const [busy,setBusy]=useState(false),[error,setError]=useState(false);const running=useRef(false);
  const connect=useCallback(async()=>{
    setBusy(true);
    const token=await getAccessToken();if(!token)throw new Error("Authentication required");
    const headers={authorization:`Bearer ${token}`};
    let response=await fetch("/api/auth/cognito/wallet-link/start",{method:"POST",headers});
    if(!response.ok)throw new Error("Account link unavailable");
    let started=await response.json();
    if(started.walletCreationAllowed===true){
      if(auth.session?.enrollment?.mode!=="new" || (await withOperationDeadline(refreshUser(),30_000)).id!==started.privyUserId)throw new Error("Account mismatch");
      await withOperationDeadline(createWallet({createAdditional:false}),30_000);
      const proof=await getAccessToken();if(!proof)throw new Error("Authentication required");
      response=await fetch("/api/auth/cognito/wallet-link/start",{method:"POST",headers:{authorization:`Bearer ${proof}`}});
      if(!response.ok)throw new Error("Account link unavailable");
      const retried=await response.json();
      if(retried.walletCreationAllowed || retried.privyUserId!==started.privyUserId)throw new Error("Account mismatch");
      started=retried;
    }
    const {walletToken,privyUserId,alreadyLinked}=started;
    if(!alreadyLinked){
      const linked=await linkWithCustomJwt(walletToken);
      if(linked.user.id!==privyUserId)throw new Error("Account mismatch");
    }
    const refreshed=await getAccessToken();if(!refreshed)throw new Error("Authentication required");
    const completed=await fetch("/api/auth/cognito/wallet-link/complete",{method:"POST",headers:{authorization:`Bearer ${refreshed}`}});
    if(!completed.ok)throw new Error("Account link unavailable");
    sessionStorage.removeItem(MARKER);await auth.refresh();
    router.replace(loginHref as Route);
  },[getAccessToken,linkWithCustomJwt,auth,loginHref,router,createWallet,refreshUser]);
  useEffect(()=>{
    if(!ready || !authenticated || !auth.session || auth.session.walletLinked || running.current)return;
    let timestamp=0;try{timestamp=Number(sessionStorage.getItem(MARKER));}catch{return;}
    if(!timestamp || Date.now()-timestamp>600_000)return;
    running.current=true;
    void connect().catch(()=>{setError(true);setBusy(false);try{sessionStorage.setItem(MARKER,"failed");}catch{}});
  },[ready,authenticated,auth.session,connect]);
  const begin=async(provider:"google"|"apple")=>{
    setBusy(true);setError(false);
    try{sessionStorage.setItem(MARKER,String(Date.now()));if(authenticated)await logout();await initOAuth({provider,disableSignup:auth.session?.enrollment?.mode!=="new"});}
    catch{setError(true);setBusy(false);sessionStorage.setItem(MARKER,"failed");}
  };
  useEffect(()=>{
    if(auth.session?.walletLinked)router.replace(loginHref as Route);
  },[auth.session?.walletLinked,loginHref,router]);
  const enrollmentStarted=useRef(false);
  useEffect(()=>{
    if(!ready || !auth.session || auth.session.walletLinked || busy || error || running.current || enrollmentStarted.current || auth.session.enrollment?.mode!=="new" || !auth.session.enrollment.provider)return;
    try{if(sessionStorage.getItem(MARKER)){enrollmentStarted.current=true;return;}}catch{return;}
    enrollmentStarted.current=true;void begin(auth.session.enrollment.provider);
  });
  const blocked=!auth.loading&&auth.session?.enrollment?.mode==="blocked";
  const missing=!auth.loading&&!auth.session;
  const waiting=auth.loading||(!missing&&!blocked&&!ready);
  const disabled=busy||waiting||!auth.session||blocked;
  const sessionMessage=waiting?sessionLabels[locale][0]:missing?sessionLabels[locale][1]:blocked?sessionLabels[locale][2]:null;
  return <main className={styles.sessionPage}><section className={styles.panel} aria-labelledby="wallet-link-title" aria-busy={busy}>
    <div className={styles.sessionContents} lang={locale}>
      <div className={`${styles.copy} ${pageStyles.copy}`}>
        <h1 id="wallet-link-title">{copy[0]}</h1><p>{copy[1]}</p>
      </div>
      <div className={pageStyles.providerButtons}>
        <button className={styles.googleButton} type="button" disabled={disabled} aria-describedby={sessionMessage?"wallet-link-status":undefined} onClick={()=>void begin("google")}><GoogleMark /><span>{copy[2]}</span><ArrowRight /></button>
        {appleLoginEnabled&&<button className={styles.appleButton} type="button" disabled={disabled} aria-describedby={sessionMessage?"wallet-link-status":undefined} onClick={()=>void begin("apple")}><AppleMark /><span>{copy[3]}</span><ArrowRight /></button>}
      </div>
      {busy&&<p className={pageStyles.notice} role="status">{copy[4]}</p>}
      {error&&<p className={pageStyles.notice} role="alert">{copy[5]}</p>}
      {sessionMessage&&<p id="wallet-link-status" className={pageStyles.notice} role={missing||blocked?"alert":"status"}>{sessionMessage}</p>}
      {!waiting&&!missing&&!blocked&&<p className={pageStyles.notice}>{copy[6]}</p>}
      <a className={pageStyles.backLink} href={loginHref}>{copy[7]}</a>
    </div>
  </section></main>;
}
