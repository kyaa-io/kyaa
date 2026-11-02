import type {AppLocale} from '@/i18n/locales';
const values:Record<AppLocale,readonly[string,string,string,string]>={
 ko:['내 접속 상태를 팬들에게 보여줄지 정해요.','접속 상태와 오늘 방문 여부를 팬에게 공개해요','공개하면 현재 접속과 오늘 방문 여부가 팬페이지에 표시됩니다.','팬들에게 보이는 모습'],
 en:['Choose whether fans can see your presence.','Share your online status and today’s visit with fans','When enabled, your online status and today’s visit appear on the fan page.','What fans see'],
 ja:['接続状況をファンに公開するか選びます。','接続状況と今日の訪問をファンに公開します','公開すると、接続状況と今日の訪問がファンページに表示されます。','ファンへの表示'],
 'zh-Hans':['选择是否向粉丝显示在线状态。','向粉丝公开在线状态和今日访问','开启后，在线状态和今日访问将显示在粉丝主页上。','粉丝看到的样子'],
 'zh-Hant':['選擇是否向粉絲顯示上線狀態。','向粉絲公開上線狀態與今日造訪','開啟後，上線狀態與今日造訪將顯示在粉絲專頁上。','粉絲看到的樣子'],
 es:['Elige si tus fans pueden ver tu presencia.','Comparte tu estado y tu visita de hoy con tus fans','Al activarlo, tu estado y tu visita de hoy aparecen en la página de fans.','Lo que ven tus fans'],
 id:['Pilih apakah penggemar dapat melihat kehadiranmu.','Bagikan status online dan kunjungan hari ini kepada penggemar','Saat diaktifkan, status online dan kunjungan hari ini tampil di halaman penggemar.','Tampilan bagi penggemar'],
 vi:['Chọn có hiển thị trạng thái của bạn cho người hâm mộ hay không.','Chia sẻ trạng thái trực tuyến và lượt ghé hôm nay với người hâm mộ','Khi bật, trạng thái trực tuyến và lượt ghé hôm nay sẽ hiện trên trang người hâm mộ.','Người hâm mộ nhìn thấy'],
 th:['เลือกว่าจะแสดงสถานะให้แฟนเห็นหรือไม่','แชร์สถานะออนไลน์และการเข้าชมวันนี้ให้แฟนเห็น','เมื่อเปิด สถานะออนไลน์และการเข้าชมวันนี้จะแสดงในหน้าแฟนเพจ','สิ่งที่แฟนเห็น'],
 pt:['Escolha se os fãs podem ver sua presença.','Compartilhe seu estado online e a visita de hoje com os fãs','Ao ativar, seu estado online e a visita de hoje aparecem na página de fãs.','O que os fãs veem'],
 fr:['Choisissez si les fans peuvent voir votre présence.','Partagez votre statut et votre visite du jour avec les fans','Une fois activé, votre statut et votre visite du jour apparaissent sur la page de fans.','Ce que voient les fans'],
 ru:['Выберите, показывать ли присутствие фанатам.','Показывайте статус онлайн и сегодняшний визит фанатам','После включения статус онлайн и сегодняшний визит появятся на фан-странице.','Что видят фанаты'],
};
export const presencePersonalCopy=(locale:AppLocale)=>values[locale];
