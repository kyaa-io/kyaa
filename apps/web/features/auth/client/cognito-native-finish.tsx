"use client";
import { useEffect,useRef,useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePageLocale } from "../../../components/locale-provider";
import styles from "../../../components/login-page.module.css";
import pageStyles from "./cognito-auth-pages.module.css";
const messages={
  ko:["앱으로 돌아가지 못했어요. 앱에서 로그인을 다시 시작해 주세요.","앱으로 돌아가고 있어요."],
  en:["Couldn't return to the app. Restart sign-in in the app.","Returning to the app…"],
  ja:["アプリに戻れませんでした。アプリからログインをやり直してください。","アプリに戻っています…"],
  "zh-Hans":["无法返回应用，请在应用中重新登录。","正在返回应用…"],
  "zh-Hant":["無法返回應用程式，請在應用程式中重新登入。","正在返回應用程式…"],
  es:["No se pudo volver a la aplicación. Reinicia el inicio de sesión en ella.","Volviendo a la aplicación…"],
  id:["Tidak dapat kembali ke aplikasi. Mulai login lagi dari aplikasi.","Kembali ke aplikasi…"],
  vi:["Không thể quay lại ứng dụng. Vui lòng đăng nhập lại từ ứng dụng.","Đang quay lại ứng dụng…"],
  th:["กลับไปยังแอปไม่สำเร็จ โปรดเริ่มเข้าสู่ระบบใหม่ในแอป","กำลังกลับไปยังแอป…"],
  pt:["Não foi possível voltar à aplicação. Reinicie o início de sessão na aplicação.","A voltar à aplicação…"],
  fr:["Impossible de revenir à l’application. Relancez la connexion dans l’application.","Retour à l’application…"],
  ru: ["Не удалось вернуться в приложение. Необходимо перезапустить вход в приложение.","Возвращаясь к приложению…"],

};
export function CognitoNativeFinish(){
  const query=useSearchParams(),locale=usePageLocale(),started=useRef(false);
  const [failed,setFailed]=useState(false);
  useEffect(()=>{
    if(started.current)return;started.current=true;
    void fetch("/api/auth/cognito/native/issue",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({challenge:query.get("challenge"),state:query.get("state")})})
      .then(async response=>{if(!response.ok)throw new Error("Handoff unavailable");const {redirectUrl}=await response.json();window.location.replace(redirectUrl);})
      .catch(()=>setFailed(true));
  },[query]);
  return <main className={styles.sessionPage}><section className={styles.panel} aria-labelledby="native-finish-title">
    <div className={styles.sessionContents} lang={locale}>
      <div className={`${styles.copy} ${pageStyles.copy}`}>
        <h1 id="native-finish-title">kyaa</h1><p role={failed?"alert":"status"}>{messages[locale][failed?0:1]}</p>
      </div>
    </div>
  </section></main>;
}
