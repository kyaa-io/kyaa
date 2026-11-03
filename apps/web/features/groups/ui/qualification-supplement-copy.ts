import type {AppLocale} from '@/i18n/locales';
const copy:Record<AppLocale,readonly [string,string,string,string,string,string,string,string,string,string]>={
ko:['신청 검토·보완','접수 상태','보완 요청','보완 설명','보완 증빙','자료 선택','승인 이후','승인된 권한에 따라 운영 메뉴를 이용할 수 있어요.','보완 자료 제출','추가로 확인할 내용을 적어주세요.'],
en:['Review and supplement','Application status','Requested changes','Additional explanation','Supporting evidence','Choose images','After approval','You can use the management menu according to your approved permissions.','Submit supplement','Add information needed for verification.'],
ja:['申請の確認・補足','受付状況','補足依頼','補足説明','補足資料','資料を選択','承認後','承認された権限に応じて運営メニューを利用できます。','補足資料を提出','追加で確認が必要な内容を入力してください。'],
'zh-Hans':['申请审核与补充','申请状态','补充要求','补充说明','补充材料','选择材料','批准后','您可以根据获批权限使用管理菜单。','提交补充材料','请填写需要进一步核实的内容。'],
'zh-Hant':['申請審核與補充','申請狀態','補充要求','補充說明','補充資料','選擇資料','核准後','您可以依核准權限使用管理選單。','提交補充資料','請填寫需要進一步確認的內容。'],
es:['Revisar y completar','Estado de la solicitud','Cambios solicitados','Explicación adicional','Documentos de apoyo','Elegir imágenes','Tras la aprobación','Podrás usar el menú de gestión según los permisos aprobados.','Enviar información','Añade la información necesaria para la verificación.'],
id:['Tinjau dan lengkapi','Status pengajuan','Permintaan perbaikan','Penjelasan tambahan','Bukti tambahan','Pilih gambar','Setelah disetujui','Menu pengelolaan tersedia sesuai izin yang disetujui.','Kirim pelengkap','Tambahkan informasi yang perlu diverifikasi.'],
vi:['Xét duyệt và bổ sung','Trạng thái đơn','Yêu cầu bổ sung','Giải thích bổ sung','Tài liệu bổ sung','Chọn ảnh','Sau khi được duyệt','Bạn có thể dùng menu quản lý theo quyền được phê duyệt.','Gửi bổ sung','Nhập thông tin cần xác minh thêm.'],
th:['ตรวจสอบและเพิ่มเติม','สถานะคำขอ','คำขอข้อมูลเพิ่มเติม','คำอธิบายเพิ่มเติม','หลักฐานเพิ่มเติม','เลือกรูปภาพ','หลังอนุมัติ','คุณสามารถใช้เมนูจัดการตามสิทธิ์ที่ได้รับอนุมัติ','ส่งข้อมูลเพิ่มเติม','เพิ่มข้อมูลที่จำเป็นต้องตรวจสอบ'],
pt:['Rever e complementar','Estado do pedido','Alterações solicitadas','Explicação adicional','Documentos de apoio','Escolher imagens','Após a aprovação','Poderás usar o menu de gestão de acordo com as permissões aprovadas.','Enviar complemento','Acrescenta as informações necessárias para a verificação.'],
fr:['Vérifier et compléter','État de la demande','Modifications demandées','Explications complémentaires','Justificatifs','Choisir des images','Après approbation','Le menu de gestion sera accessible selon les autorisations approuvées.','Envoyer le complément','Ajoutez les informations nécessaires à la vérification.'],
ru:['Проверка и дополнение','Статус заявки','Запрошенные изменения','Дополнительное пояснение','Подтверждающие материалы','Выбрать изображения','После одобрения','Меню управления будет доступно в соответствии с одобренными правами.','Отправить дополнение','Добавьте сведения для проверки.'],
};
export const qualificationSupplementCopy=(locale:AppLocale)=>copy[locale];
