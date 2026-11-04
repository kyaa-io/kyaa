import type {AppLocale} from "@/i18n/locales";
type ActivityCardCopy={title:string;body:string;check:string;attendance:string};
export const activityCardCopy:Record<AppLocale,ActivityCardCopy>={
 ko:{title:'모임 활동 인증',body:'조건을 확인하고 인증을 제출해요.',check:'인증 조건 확인',attendance:'출석체크'},
 en:{title:'Activity verification',body:'Check the requirements and submit your proof.',check:'Check requirements',attendance:'Attendance'},
 ja:{title:'活動認証',body:'条件を確認して認証を提出します。',check:'認証条件を確認',attendance:'出席チェック'},
 'zh-Hans':{title:'活动认证',body:'确认条件并提交认证。',check:'查看认证条件',attendance:'签到'},
 'zh-Hant':{title:'活動認證',body:'確認條件並提交認證。',check:'查看認證條件',attendance:'簽到'},
 es:{title:'Verificación de actividad',body:'Revisa los requisitos y envía tu comprobante.',check:'Ver requisitos',attendance:'Asistencia'},
 id:{title:'Verifikasi aktivitas',body:'Cek syaratnya dan kirim bukti verifikasi.',check:'Cek syarat',attendance:'Absen'},
 vi:{title:'Xác minh hoạt động',body:'Kiểm tra điều kiện và gửi minh chứng.',check:'Xem điều kiện',attendance:'Điểm danh'},
 th:{title:'ยืนยันกิจกรรม',body:'ตรวจสอบเงื่อนไขแล้วส่งหลักฐาน',check:'ดูเงื่อนไข',attendance:'เช็กชื่อ'},
 pt:{title:'Verificação de atividade',body:'Confira os requisitos e envie sua comprovação.',check:'Ver requisitos',attendance:'Presença'},
 fr:{title:'Vérification d’activité',body:'Consultez les conditions et envoyez votre preuve.',check:'Voir les conditions',attendance:'Présence'},
 ru:{title:'Подтверждение активности',body:'Проверьте условия и отправьте подтверждение.',check:'Условия',attendance:'Отметка'},
};
