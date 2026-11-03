"use client";
import type {AppLocale} from '@/i18n/locales';
import type {CameraAccessIssue} from '@/features/fanpage/domain/camera-access';
import {FanAction} from '@/components/fan-ui/fan-action';
import styles from './profile-camera-access.module.css';
const copy:Record<AppLocale,readonly [string,string,string,string,string]>={
 ko:['카메라 권한 없음','브라우저 설정에서 카메라 접근을 허용해 주세요.','카메라 다시 열기','카메라 미지원','친구가 공유한 프로필 링크로 접속해 주세요.'],
 en:['Camera permission denied','Allow camera access in your browser settings.','Reopen camera','Camera unsupported','Open the profile link shared by your friend.'],
 ja:['カメラの権限がありません','ブラウザの設定でカメラへのアクセスを許可してください。','カメラを再度開く','カメラ非対応','友だちが共有したプロフィールリンクを開いてください。'],
 'zh-Hans':['没有相机权限','请在浏览器设置中允许访问相机。','重新打开相机','不支持相机','请打开好友分享的个人资料链接。'],
 'zh-Hant':['沒有相機權限','請在瀏覽器設定中允許存取相機。','重新開啟相機','不支援相機','請開啟好友分享的個人資料連結。'],
 es:['Sin permiso de cámara','Permite el acceso a la cámara en los ajustes del navegador.','Reabrir cámara','Cámara no compatible','Abre el enlace de perfil que compartió tu amigo.'],
 id:['Izin kamera ditolak','Izinkan akses kamera di pengaturan browser.','Buka ulang kamera','Kamera tidak didukung','Buka tautan profil yang dibagikan teman.'],
 vi:['Không có quyền dùng camera','Cho phép truy cập camera trong cài đặt trình duyệt.','Mở lại camera','Không hỗ trợ camera','Mở liên kết hồ sơ do bạn bè chia sẻ.'],
 th:['ไม่มีสิทธิ์ใช้กล้อง','อนุญาตการเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์','เปิดกล้องอีกครั้ง','ไม่รองรับกล้อง','เปิดลิงก์โปรไฟล์ที่เพื่อนแชร์'],
 pt:['Sem permissão para câmera','Permita o acesso à câmera nas configurações do navegador.','Reabrir câmera','Câmera não compatível','Abra o link de perfil compartilhado pelo seu amigo.'],
 fr:['Accès à la caméra refusé','Autorisez la caméra dans les paramètres du navigateur.','Rouvrir la caméra','Caméra non prise en charge','Ouvrez le lien de profil partagé par votre ami.'],
 ru:['Нет разрешения на камеру','Разрешите доступ к камере в настройках браузера.','Открыть камеру снова','Камера не поддерживается','Откройте ссылку на профиль, которой поделился друг.'],
};
export function ProfileCameraAccessState({locale,issue,onRetry}:{locale:AppLocale;issue:CameraAccessIssue;onRetry:()=>void}){
 const t=copy[locale];return <section className={styles.state} role='alert' data-profile-camera-state={issue}><h3>{issue==='denied'?t[0]:t[3]}</h3><p>{issue==='denied'?t[1]:t[4]}</p>{issue==='denied'&&<FanAction variant='primary' className={styles.retry} onClick={onRetry}>{t[2]}</FanAction>}</section>;
}
