import type {AppLocale} from '@/i18n/locales';
const copy:Record<AppLocale,readonly [string,string,string,string,string]>={
 ko:['광고 보고 교환하기','광고 보기','광고를 불러오고 있어요.','광고 시청이 완료되지 않았어요. 포인트는 차감되지 않았어요.','지금은 볼 수 있는 광고가 없어요. 포인트는 차감되지 않았어요.'],
 en:['Watch an ad to exchange','Watch ad','Loading the ad.','The ad was not completed. No points were deducted.','No ad is available right now. No points were deducted.'],
 ja:['広告を見て交換する','広告を見る','広告を読み込んでいます。','広告の視聴が完了しませんでした。ポイントは差し引かれていません。','現在表示できる広告がありません。ポイントは差し引かれていません。'],
 'zh-Hans':['观看广告后兑换','观看广告','正在加载广告。','广告未看完，积分未扣除。','目前没有可观看的广告，积分未扣除。'],
 'zh-Hant':['觀看廣告後兌換','觀看廣告','正在載入廣告。','廣告未看完，點數未扣除。','目前沒有可觀看的廣告，點數未扣除。'],
 es:['Ver un anuncio para canjear','Ver anuncio','Cargando el anuncio.','El anuncio no se completó. No se descontaron puntos.','No hay anuncios disponibles ahora. No se descontaron puntos.'],
 id:['Tonton iklan untuk menukar','Tonton iklan','Memuat iklan.','Iklan belum selesai. Poin tidak dipotong.','Belum ada iklan tersedia. Poin tidak dipotong.'],
 vi:['Xem quảng cáo để đổi','Xem quảng cáo','Đang tải quảng cáo.','Quảng cáo chưa xem xong. Điểm chưa bị trừ.','Hiện không có quảng cáo. Điểm chưa bị trừ.'],
 th:['ดูโฆษณาเพื่อแลก','ดูโฆษณา','กำลังโหลดโฆษณา','ดูโฆษณาไม่จบ ยังไม่หักแต้ม','ขณะนี้ไม่มีโฆษณา ยังไม่หักแต้ม'],
 pt:['Assistir a um anúncio para trocar','Assistir ao anúncio','Carregando o anúncio.','O anúncio não foi concluído. Nenhum ponto foi descontado.','Nenhum anúncio disponível agora. Nenhum ponto foi descontado.'],
 fr:['Regarder une publicité pour échanger','Regarder la publicité','Chargement de la publicité.','La publicité n’a pas été terminée. Aucun point n’a été déduit.','Aucune publicité disponible pour le moment. Aucun point n’a été déduit.'],
 ru:['Посмотреть рекламу и обменять','Смотреть рекламу','Загружаем рекламу.','Реклама не досмотрена. Баллы не списаны.','Сейчас нет доступной рекламы. Баллы не списаны.'],
};
export function rewardedExchangeCopy(locale:AppLocale){const [action,watch,loading,incomplete,unavailable]=copy[locale];return {action,watch,loading,incomplete,unavailable};}
