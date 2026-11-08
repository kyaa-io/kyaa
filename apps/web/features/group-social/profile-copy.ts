import type { AppLocale } from '@/i18n/locales';
const copy = {
 ko:['내 프로필','내 친구 추가 QR','QR 미리보기 · 링크 연결 전','친구 QR 찍기','내 프로필 링크 복사','QR을 찍으면 프로필을 확인한 뒤 친구 요청을 보낼 수 있어요.','카메라 미리보기','친구의 QR을 화면 안에 맞춰주세요.','카메라 권한이 필요해요. 스캔 후 상대 프로필을 확인할 수 있어요.','상대 프로필','찾으신 친구가 맞나요?','다시 스캔하기','상대가 요청을 수락하면 친구가 돼요.','닫기'],
 en:['My profile','My friend QR','QR preview · link not connected','Scan friend QR','Copy my profile link','Scan a QR to review a profile and send a friend request.','Camera preview','Fit your friend’s QR inside the screen.','Camera permission is needed. Review their profile after scanning.','Friend profile','Is this your friend?','Scan again','You become friends when they accept your request.','Close'],
 ja:['マイプロフィール','友だち追加QR','QRプレビュー · リンク未接続','友だちのQRを読み取る','プロフィールリンクをコピー','QRを読み取るとプロフィールを確認して友だち申請できます。','カメラプレビュー','友だちのQRを画面内に合わせてください。','カメラの許可が必要です。読み取り後にプロフィールを確認できます。','相手のプロフィール','お探しの友だちですか？','もう一度読み取る','相手が申請を承認すると友だちになります。','閉じる'],
 'zh-Hans':['我的资料','我的好友二维码','二维码预览 · 尚未连接链接','扫描好友二维码','复制我的资料链接','扫码后可查看资料并发送好友申请。','相机预览','请将好友的二维码对准屏幕。','需要相机权限。扫码后可查看对方资料。','对方资料','这是您要找的好友吗？','重新扫描','对方接受申请后即可成为好友。','关闭'],
 'zh-Hant':['我的個人檔案','我的好友QR碼','QR碼預覽 · 尚未連結','掃描好友QR碼','複製我的個人檔案連結','掃描QR碼後可查看個人檔案並傳送好友邀請。','相機預覽','請將好友的QR碼對準畫面。','需要相機權限。掃描後可查看對方個人檔案。','對方個人檔案','這是您要找的好友嗎？','重新掃描','對方接受邀請後即可成為好友。','關閉'],
 es:['Mi perfil','Mi QR de amistad','Vista previa QR · sin enlace','Escanear QR de un amigo','Copiar enlace de mi perfil','Escanea un QR para ver el perfil y enviar una solicitud.','Vista previa de cámara','Coloca el QR de tu amigo dentro de la pantalla.','Se necesita permiso de cámara. Podrás revisar el perfil tras escanear.','Perfil del amigo','¿Es este tu amigo?','Escanear de nuevo','Serán amigos cuando acepte tu solicitud.','Cerrar'],
 id:['Profil saya','QR pertemanan saya','Pratinjau QR · belum terhubung','Pindai QR teman','Salin tautan profil saya','Pindai QR untuk melihat profil dan mengirim permintaan pertemanan.','Pratinjau kamera','Posisikan QR teman di dalam layar.','Izin kamera diperlukan. Lihat profil setelah memindai.','Profil teman','Apakah ini teman Anda?','Pindai lagi','Anda berteman setelah permintaan diterima.','Tutup'],
 vi:['Hồ sơ của tôi','QR kết bạn của tôi','Xem trước QR · chưa kết nối liên kết','Quét QR của bạn','Sao chép liên kết hồ sơ','Quét QR để xem hồ sơ và gửi lời mời kết bạn.','Xem trước camera','Đặt mã QR của bạn bè vào trong màn hình.','Cần quyền camera. Bạn có thể xem hồ sơ sau khi quét.','Hồ sơ của bạn','Đây có phải người bạn đang tìm?','Quét lại','Bạn sẽ kết bạn khi lời mời được chấp nhận.','Đóng'],
 th:['โปรไฟล์ของฉัน','QR เพิ่มเพื่อนของฉัน','ตัวอย่าง QR · ยังไม่เชื่อมต่อลิงก์','สแกน QR เพื่อน','คัดลอกลิงก์โปรไฟล์ของฉัน','สแกน QR เพื่อดูโปรไฟล์และส่งคำขอเป็นเพื่อน','ตัวอย่างกล้อง','วาง QR ของเพื่อนให้อยู่ภายในหน้าจอ','ต้องอนุญาตให้ใช้กล้อง คุณจะดูโปรไฟล์ได้หลังสแกน','โปรไฟล์เพื่อน','นี่คือเพื่อนที่คุณกำลังค้นหาหรือไม่?','สแกนอีกครั้ง','คุณจะเป็นเพื่อนกันเมื่ออีกฝ่ายยอมรับคำขอ','ปิด'],
 pt:['Meu perfil','Meu QR de amizade','Prévia do QR · sem link conectado','Escanear QR de amigo','Copiar link do meu perfil','Escaneie um QR para ver o perfil e enviar uma solicitação.','Prévia da câmera','Posicione o QR do amigo dentro da tela.','É necessária permissão da câmera. Veja o perfil após escanear.','Perfil do amigo','Este é seu amigo?','Escanear novamente','Vocês serão amigos quando a solicitação for aceita.','Fechar'],
 fr:['Mon profil','Mon QR d’amitié','Aperçu QR · lien non connecté','Scanner le QR d’un ami','Copier le lien de mon profil','Scannez un QR pour voir le profil et envoyer une demande d’amitié.','Aperçu de la caméra','Placez le QR de votre ami dans l’écran.','L’autorisation de la caméra est nécessaire. Consultez le profil après le scan.','Profil de l’ami','Est-ce votre ami ?','Scanner à nouveau','Vous devenez amis une fois la demande acceptée.','Fermer'],
 ru:['Мой профиль','Мой QR для друзей','Предпросмотр QR · ссылка не подключена','Сканировать QR друга','Копировать ссылку на мой профиль','Отсканируйте QR, чтобы посмотреть профиль и отправить запрос в друзья.','Предпросмотр камеры','Поместите QR друга в рамку экрана.','Необходимо разрешение камеры. После сканирования можно посмотреть профиль.','Профиль друга','Это ваш друг?','Сканировать снова','Вы станете друзьями после принятия запроса.','Закрыть'],
} satisfies Record<AppLocale,string[]>;
const keys=['profile','qr','preview','scan','copy','help','camera','scanHelp','permission','peer','confirm','again','acceptance','close'] as const;
const addFriend:Record<AppLocale,string>={ko:'친구 추가',en:'Add a friend',ja:'友だちを追加','zh-Hans':'添加好友','zh-Hant':'新增好友',es:'Añadir un amigo',id:'Tambah teman',vi:'Thêm bạn',th:'เพิ่มเพื่อน',pt:'Adicionar amigo',fr:'Ajouter un ami',ru:'Добавить друга'};
export function profileConnectionCopy(locale:AppLocale){return {...Object.fromEntries(keys.map((key,index)=>[key,copy[locale][index]])) as Record<typeof keys[number],string>,addFriend:addFriend[locale]};}

const connectionDetail:Record<AppLocale,readonly[string,string]>={ko:['공개한 최애','친구 목록'],en:['Shared favorite','Friends list'],ja:['公開している推し','友だち一覧'],'zh-Hans':['公开的最爱','好友列表'],'zh-Hant':['公開的最愛','好友列表'],es:['Favorito público','Lista de amigos'],id:['Favorit publik','Daftar teman'],vi:['Yêu thích công khai','Danh sách bạn bè'],th:['รายการโปรดที่เปิดเผย','รายชื่อเพื่อน'],pt:['Favorito público','Lista de amigos'],fr:['Favori partagé','Liste d’amis'],ru:['Открытый фаворит','Список друзей']};
export const profileConnectionDetailCopy=(locale:AppLocale)=>connectionDetail[locale];
/** 404 from the profile link: an expired link, or no shared favorite whose Passport the viewer holds (resolve_social_profile_link returns null for both). */
const profileUnreachable:Record<AppLocale,string>={
 ko:'프로필을 열 수 없어요. 상대가 공개한 최애 중 내가 패스포트를 가진 크리에이터가 없거나, QR이 만료됐어요.',
 en:'This profile can’t be opened. The other person has no shared favorite that you hold a Passport for, or the QR code has expired.',
 ja:'プロフィールを開けません。相手が公開している推しの中にあなたがパスポートを持つクリエイターがいないか、QRの有効期限が切れています。',
 'zh-Hans':'无法打开该个人资料。对方公开的最爱中没有你持有护照的创作者，或二维码已过期。',
 'zh-Hant':'無法開啟該個人檔案。對方公開的最愛中沒有您持有護照的創作者，或 QR 碼已過期。',
 es:'No se puede abrir este perfil. La otra persona no comparte ningún favorito del que tengas pasaporte, o el QR ha caducado.',
 id:'Profil ini tidak bisa dibuka. Tidak ada favorit publik dia yang paspornya Anda miliki, atau QR sudah kedaluwarsa.',
 vi:'Không thể mở hồ sơ này. Người kia không công khai người yêu thích nào mà bạn có hộ chiếu, hoặc mã QR đã hết hạn.',
 th:'เปิดโปรไฟล์นี้ไม่ได้ อีกฝ่ายไม่ได้เปิดเผยรายการโปรดที่คุณมีพาสปอร์ต หรือ QR หมดอายุแล้ว',
 pt:'Não foi possível abrir este perfil. A outra pessoa não compartilha nenhum favorito de que você tenha passaporte, ou o QR expirou.',
 fr:'Impossible d’ouvrir ce profil. Cette personne ne partage aucun favori dont vous avez le passeport, ou le QR a expiré.',
 ru:'Не удалось открыть профиль. У этого пользователя нет открытого фаворита, на которого у вас есть паспорт, либо QR истёк.'
};
export const profileUnreachableCopy=(locale:AppLocale)=>profileUnreachable[locale];
