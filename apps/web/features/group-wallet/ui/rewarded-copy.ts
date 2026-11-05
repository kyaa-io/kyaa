import type {AppLocale} from '@/i18n/locales';
const copy:Record<AppLocale,readonly [string,string,string,string,string,string,string,string,string]>={
 ko:['광고 보고 교환하기','광고 보기','광고를 불러오고 있어요.','광고 시청이 완료되지 않았어요. 포인트는 차감되지 않았어요.','지금은 볼 수 있는 광고가 없어요. 포인트는 차감되지 않았어요.','광고 준비 중이라 아직 교환할 수 없어요','오늘은 더 교환할 수 없어요. 포인트는 차감되지 않았어요.','요청이 많아요. 잠시 후 다시 시도해 주세요. 포인트는 차감되지 않았어요.','광고 확인 시간이 지났어요. 다시 시도해 주세요. 포인트는 차감되지 않았어요.'],
 en:['Watch an ad to exchange','Watch ad','Loading the ad.','The ad was not completed. No points were deducted.','No ad is available right now. No points were deducted.','Ads aren’t set up yet, so exchange isn’t available','You can’t exchange any more today. No points were deducted.','Too many requests. Please try again shortly. No points were deducted.','The ad check expired. Please try again. No points were deducted.'],
 ja:['広告を見て交換する','広告を見る','広告を読み込んでいます。','広告の視聴が完了しませんでした。ポイントは差し引かれていません。','現在表示できる広告がありません。ポイントは差し引かれていません。','広告の準備中のため、まだ交換できません','本日はこれ以上交換できません。ポイントは差し引かれていません。','リクエストが多すぎます。しばらくしてからもう一度お試しください。ポイントは差し引かれていません。','広告の確認期限が切れました。もう一度お試しください。ポイントは差し引かれていません。'],
 'zh-Hans':['观看广告后兑换','观看广告','正在加载广告。','广告未看完，积分未扣除。','目前没有可观看的广告，积分未扣除。','广告尚在准备中，暂时无法兑换','今天无法再兑换。积分未扣除。','请求过多，请稍后再试。积分未扣除。','广告确认已过期，请重试。积分未扣除。'],
 'zh-Hant':['觀看廣告後兌換','觀看廣告','正在載入廣告。','廣告未看完，點數未扣除。','目前沒有可觀看的廣告，點數未扣除。','廣告尚在準備中，暫時無法兌換','今天無法再兌換。點數未扣除。','請求過多，請稍後再試。點數未扣除。','廣告確認已過期，請重試。點數未扣除。'],
 es:['Ver un anuncio para canjear','Ver anuncio','Cargando el anuncio.','El anuncio no se completó. No se descontaron puntos.','No hay anuncios disponibles ahora. No se descontaron puntos.','Los anuncios aún no están listos, así que no se puede canjear','Hoy no puedes canjear más. No se descontaron puntos.','Demasiadas solicitudes. Inténtalo de nuevo en un momento. No se descontaron puntos.','La verificación del anuncio caducó. Inténtalo de nuevo. No se descontaron puntos.'],
 id:['Tonton iklan untuk menukar','Tonton iklan','Memuat iklan.','Iklan belum selesai. Poin tidak dipotong.','Belum ada iklan tersedia. Poin tidak dipotong.','Iklan masih disiapkan, jadi belum bisa menukar','Hari ini tidak bisa menukar lagi. Poin tidak dipotong.','Terlalu banyak permintaan. Coba lagi sebentar lagi. Poin tidak dipotong.','Verifikasi iklan kedaluwarsa. Coba lagi. Poin tidak dipotong.'],
 vi:['Xem quảng cáo để đổi','Xem quảng cáo','Đang tải quảng cáo.','Quảng cáo chưa xem xong. Điểm chưa bị trừ.','Hiện không có quảng cáo. Điểm chưa bị trừ.','Quảng cáo đang được chuẩn bị nên chưa thể đổi','Hôm nay không thể đổi thêm. Điểm chưa bị trừ.','Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút. Điểm chưa bị trừ.','Xác nhận quảng cáo đã hết hạn. Vui lòng thử lại. Điểm chưa bị trừ.'],
 th:['ดูโฆษณาเพื่อแลก','ดูโฆษณา','กำลังโหลดโฆษณา','ดูโฆษณาไม่จบ ยังไม่หักแต้ม','ขณะนี้ไม่มีโฆษณา ยังไม่หักแต้ม','โฆษณากำลังเตรียมอยู่ จึงยังแลกไม่ได้','วันนี้แลกเพิ่มไม่ได้แล้ว ยังไม่หักแต้ม','มีคำขอมากเกินไป โปรดลองใหม่ในอีกสักครู่ ยังไม่หักแต้ม','การยืนยันโฆษณาหมดอายุ โปรดลองใหม่ ยังไม่หักแต้ม'],
 pt:['Assistir a um anúncio para trocar','Assistir ao anúncio','Carregando o anúncio.','O anúncio não foi concluído. Nenhum ponto foi descontado.','Nenhum anúncio disponível agora. Nenhum ponto foi descontado.','Os anúncios ainda estão em preparação, então ainda não dá para trocar','Hoje não é possível trocar mais. Nenhum ponto foi descontado.','Muitas solicitações. Tente novamente em instantes. Nenhum ponto foi descontado.','A verificação do anúncio expirou. Tente novamente. Nenhum ponto foi descontado.'],
 fr:['Regarder une publicité pour échanger','Regarder la publicité','Chargement de la publicité.','La publicité n’a pas été terminée. Aucun point n’a été déduit.','Aucune publicité disponible pour le moment. Aucun point n’a été déduit.','Les publicités sont en préparation, l’échange n’est pas encore possible','Vous ne pouvez plus échanger aujourd’hui. Aucun point n’a été déduit.','Trop de demandes. Réessayez dans un instant. Aucun point n’a été déduit.','La vérification de la publicité a expiré. Réessayez. Aucun point n’a été déduit.'],
 ru:['Посмотреть рекламу и обменять','Смотреть рекламу','Загружаем рекламу.','Реклама не досмотрена. Баллы не списаны.','Сейчас нет доступной рекламы. Баллы не списаны.','Реклама ещё готовится, поэтому обмен пока недоступен','Сегодня больше обменять нельзя. Баллы не списаны.','Слишком много запросов. Повторите чуть позже. Баллы не списаны.','Проверка рекламы истекла. Повторите попытку. Баллы не списаны.'],
};
const causes:Record<AppLocale,readonly [string,string,string]>={
 ko:['이 기기나 브라우저에서는 광고를 볼 수 없어요. 포인트는 차감되지 않았어요.','광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요. 포인트는 차감되지 않았어요.','지금은 광고를 볼 수 없어요. 포인트는 차감되지 않았어요.'],
 en:['Ads can’t be shown on this device or browser. No points were deducted.','The ad couldn’t be loaded. Please try again shortly. No points were deducted.','Ads aren’t available right now. No points were deducted.'],
 ja:['この端末またはブラウザでは広告を表示できません。ポイントは差し引かれていません。','広告を読み込めませんでした。しばらくしてからもう一度お試しください。ポイントは差し引かれていません。','現在、広告を表示できません。ポイントは差し引かれていません。'],
 'zh-Hans':['此设备或浏览器无法显示广告，积分未扣除。','广告加载失败，请稍后再试。积分未扣除。','目前无法观看广告，积分未扣除。'],
 'zh-Hant':['此裝置或瀏覽器無法顯示廣告，點數未扣除。','廣告載入失敗，請稍後再試。點數未扣除。','目前無法觀看廣告，點數未扣除。'],
 es:['Este dispositivo o navegador no puede mostrar anuncios. No se descontaron puntos.','No se pudo cargar el anuncio. Inténtalo de nuevo en un momento. No se descontaron puntos.','Ahora mismo no se pueden ver anuncios. No se descontaron puntos.'],
 id:['Iklan tidak dapat ditampilkan di perangkat atau browser ini. Poin tidak dipotong.','Iklan gagal dimuat. Coba lagi sebentar lagi. Poin tidak dipotong.','Saat ini iklan tidak dapat ditonton. Poin tidak dipotong.'],
 vi:['Thiết bị hoặc trình duyệt này không thể hiển thị quảng cáo. Điểm chưa bị trừ.','Không tải được quảng cáo. Vui lòng thử lại sau ít phút. Điểm chưa bị trừ.','Hiện không thể xem quảng cáo. Điểm chưa bị trừ.'],
 th:['อุปกรณ์หรือเบราว์เซอร์นี้แสดงโฆษณาไม่ได้ ยังไม่หักแต้ม','โหลดโฆษณาไม่สำเร็จ โปรดลองใหม่ในอีกสักครู่ ยังไม่หักแต้ม','ขณะนี้ดูโฆษณาไม่ได้ ยังไม่หักแต้ม'],
 pt:['Este dispositivo ou navegador não consegue exibir anúncios. Nenhum ponto foi descontado.','Não foi possível carregar o anúncio. Tente novamente em instantes. Nenhum ponto foi descontado.','Não é possível assistir a anúncios agora. Nenhum ponto foi descontado.'],
 fr:['Cet appareil ou ce navigateur ne peut pas afficher de publicité. Aucun point n’a été déduit.','La publicité n’a pas pu être chargée. Réessayez dans un instant. Aucun point n’a été déduit.','Impossible de regarder une publicité pour le moment. Aucun point n’a été déduit.'],
 ru:['На этом устройстве или в этом браузере нельзя показать рекламу. Баллы не списаны.','Не удалось загрузить рекламу. Повторите чуть позже. Баллы не списаны.','Сейчас нельзя посмотреть рекламу. Баллы не списаны.'],
};
export function rewardedExchangeCopy(locale:AppLocale){const [action,watch,loading,incomplete,unavailable,adOff,dailyLimit,rateLimited,sessionExpired]=copy[locale];const [unsupported,failed,unconfigured]=causes[locale];return {action,watch,loading,incomplete,unavailable,unsupported,unconfigured,failed,adOff:unavailable,dailyLimit,rateLimited,sessionExpired};}

/** Messages for failures that happen before an ad is requested (or when a session lapses); undefined falls back to the generic exchange error. */
export function rewardedSessionError(locale:AppLocale,code:string):string|undefined{const c=rewardedExchangeCopy(locale);return code==='GROUP_WALLET_AD_DAILY_LIMIT'?c.dailyLimit:code==='GROUP_WALLET_AD_RATE_LIMITED'?c.rateLimited:code==='GROUP_WALLET_AD_SESSION_INVALID'?c.sessionExpired:code==='GROUP_WALLET_AD_GATE_CLOSED'||code==='GROUP_WALLET_AD_CONFIG_MISSING'?c.adOff:undefined;}

const quantity:Record<AppLocale,readonly [string,string,string,string,string]>={
 ko:['수량','수량 줄이기','수량 늘리기','최대','교환 진행'],
 en:['Quantity','Decrease quantity','Increase quantity','Max','Exchange progress'],
 ja:['数量','数量を減らす','数量を増やす','最大','交換の進行'],
 'zh-Hans':['数量','减少数量','增加数量','最大','兑换进度'],
 'zh-Hant':['數量','減少數量','增加數量','最大','兌換進度'],
 es:['Cantidad','Disminuir cantidad','Aumentar cantidad','Máx.','Progreso del canje'],
 id:['Jumlah','Kurangi jumlah','Tambah jumlah','Maks','Progres penukaran'],
 vi:['Số lượng','Giảm số lượng','Tăng số lượng','Tối đa','Tiến độ đổi'],
 th:['จำนวน','ลดจำนวน','เพิ่มจำนวน','สูงสุด','ความคืบหน้าการแลก'],
 pt:['Quantidade','Diminuir quantidade','Aumentar quantidade','Máx.','Progresso da troca'],
 fr:['Quantité','Diminuer la quantité','Augmenter la quantité','Max','Progression de l’échange'],
 ru:['Количество','Уменьшить количество','Увеличить количество','Макс.','Ход обмена'],
};
export function rewardedQuantityCopy(locale:AppLocale){const [quantityLabel,decrease,increase,max,progress]=quantity[locale];return {quantity:quantityLabel,decrease,increase,max,progress};}
