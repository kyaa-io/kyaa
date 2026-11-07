import type { AppLocale } from "@/i18n/locales";
const keys=['manage','owner','manager','member','save','leave','transfer','confirmTransfer','roomName','createRoom','minimumTier','anonymous','title','body','write','remove'] as const;
const labels:Record<AppLocale,readonly string[]>={
 ko:['운영 관리','소유자','운영진','팬','저장','모임 나가기','소유권 이관','소유권을 넘기면 내 역할은 팬으로 바뀌어요. 계속할까요?','방 이름','비밀방 개설','최소 팬등급','새 게시글 익명 작성','제목','내용','글쓰기','삭제'],
 en:['Manage page','Owner','Manager','Fan','Save','Leave group','Transfer ownership','After the transfer, your role becomes fan. Continue?','Room name','Create private room','Minimum fan tier','Anonymous new posts','Title','Body','Write post','Delete'],
 ja:['運営管理','所有者','運営者','ファン','保存','グループを退会','所有権を譲渡','譲渡すると自分の役割はファンに変わります。続けますか？','ルーム名','秘密の部屋を開設','最低ファンランク','新規投稿を匿名にする','タイトル','本文','投稿する','削除'],
 'zh-Hans':['管理页面','所有者','管理员','粉丝','保存','退出群组','转让所有权','转让后你的角色会变为粉丝。是否继续？','房间名称','创建私密聊天室','最低粉丝等级','新帖匿名发布','标题','内容','发帖','删除'],
 'zh-Hant':['管理頁面','擁有者','管理員','粉絲','儲存','退出群組','轉讓擁有權','轉讓後你的角色會變為粉絲。是否繼續？','聊天室名稱','建立私人聊天室','最低粉絲等級','新貼文匿名發布','標題','內容','發文','刪除'],
 es:['Administrar','Propietario','Administrador','Fan','Guardar','Salir del grupo','Transferir propiedad','Tras la transferencia, tu rol será fan. ¿Continuar?','Nombre de sala','Crear sala privada','Nivel mínimo','Nuevas publicaciones anónimas','Título','Contenido','Publicar','Eliminar'],
 id:['Kelola halaman','Pemilik','Pengelola','Penggemar','Simpan','Keluar grup','Alihkan kepemilikan','Setelah dialihkan, peran Anda menjadi penggemar. Lanjutkan?','Nama ruang','Buat ruang privat','Tingkat penggemar minimum','Postingan baru anonim','Judul','Isi','Tulis postingan','Hapus'],
 vi:['Quản lý trang','Chủ sở hữu','Quản trị viên','Người hâm mộ','Lưu','Rời nhóm','Chuyển quyền sở hữu','Sau khi chuyển quyền, vai trò của bạn sẽ là người hâm mộ. Tiếp tục?','Tên phòng','Tạo phòng riêng','Cấp người hâm mộ tối thiểu','Bài mới ẩn danh','Tiêu đề','Nội dung','Viết bài','Xóa'],
 th:['จัดการเพจ','เจ้าของ','ผู้ดูแล','แฟน','บันทึก','ออกจากกลุ่ม','โอนความเป็นเจ้าของ','หลังโอนแล้ว บทบาทของคุณจะเป็นแฟน ต้องการดำเนินการต่อไหม','ชื่อห้อง','สร้างห้องส่วนตัว','ระดับแฟนขั้นต่ำ','โพสต์ใหม่แบบไม่ระบุตัวตน','หัวข้อ','เนื้อหา','เขียนโพสต์','ลบ'],
 pt:['Gerenciar','Proprietário','Administrador','Fã','Salvar','Sair do grupo','Transferir propriedade','Após a transferência, sua função será fã. Continuar?','Nome da sala','Criar sala privada','Nível mínimo','Novas publicações anônimas','Título','Conteúdo','Publicar','Excluir'],
 fr:['Gérer la page','Propriétaire','Gestionnaire','Fan','Enregistrer','Quitter le groupe','Transférer la propriété','Après le transfert, votre rôle devient fan. Continuer ?','Nom du salon','Créer un salon privé','Niveau minimum','Nouveaux messages anonymes','Titre','Contenu','Publier','Supprimer'],
 ru:['Управление','Владелец','Администратор','Фанат','Сохранить','Выйти из группы','Передать владение','После передачи ваша роль станет «фанат». Продолжить?','Название комнаты','Создать закрытую комнату','Минимальный уровень','Новые публикации анонимно','Заголовок','Текст','Написать','Удалить'],
};
export function managementCopy(locale:AppLocale){return Object.fromEntries(keys.map((key,index)=>[key,labels[locale][index]])) as Record<typeof keys[number],string>;}
export const sendLabel: Record<AppLocale,string> = {ko:'보내기',en:'Send',ja:'送信','zh-Hans':'发送','zh-Hant':'傳送',es:'Enviar',id:'Kirim',vi:'Gửi',th:'ส่ง',pt:'Enviar',fr:'Envoyer',ru:'Отправить'};
export const attachmentLabel: Record<AppLocale,string> = {ko:'사진·영상',en:'Photos and videos',ja:'写真・動画','zh-Hans':'照片和视频','zh-Hant':'照片與影片',es:'Fotos y vídeos',id:'Foto dan video',vi:'Ảnh và video',th:'รูปภาพและวิดีโอ',pt:'Fotos e vídeos',fr:'Photos et vidéos',ru:'Фото и видео'};
