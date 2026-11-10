import type {AppLocale} from '@/i18n/locales';
import type {GroupEarningEntry} from '../domain/earnings';

type Labels = readonly [title:string,result:string,scope:string,currentGroup:string,all:string,activity:string,processed:string,unknown:string,back:string,empty:string,unavailable:string,noReason:string,correctionNoReason:string,detail:string,tickets:string,legacyTickets:string,mission:string,participation:string,legacyActivity:string,raffle:string];
const labels:Record<AppLocale,Labels>={
 ko:['모임 적립 내역','참여·적립 결과','조회 범위','현재 모임','전체 활동','활동 상세','처리 시각','정보 없음','적립 내역으로','아직 적립 내역이 없어요. 모임 덕질에서 참여할 활동을 찾아보세요.','이 내역을 확인할 수 없어요.','사유 미제공','정정 사유 미제공','상세','응모권','기존 무료 응모권','덕질 참여','활동 참여','이전 활동','추첨 응모'],
 en:['Group earnings','Participation & earnings result','Scope','Current group','All activities','Activity details','Processed at','No information','Back to earnings','No earnings yet. Find activities to join in this group.','This record is unavailable.','No reason provided','No correction reason provided','Details','tickets','legacy free tickets','Mission participation','Activity participation','Previous activity','Raffle entry'],
 ja:['グループの獲得履歴','参加・獲得結果','表示範囲','現在のグループ','すべての活動','活動の詳細','処理日時','情報なし','獲得履歴へ','獲得履歴はまだありません。グループで参加できる活動を探してみましょう。','この履歴は確認できません。','理由の記載なし','訂正理由の記載なし','詳細','応募券','従来の無料応募券','ミッション参加','活動参加','過去の活動','抽選応募'],
 'zh-Hans':['群组奖励记录','参与及奖励结果','查看范围','当前群组','全部活动','活动详情','处理时间','暂无信息','返回奖励记录','暂无奖励记录。去群组活动中寻找想参与的活动吧。','无法查看此记录。','未提供原因','未提供更正原因','详情','抽奖券','原有免费抽奖券','任务参与','活动参与','历史活动','抽奖报名'],
 'zh-Hant':['群組獎勵紀錄','參與及獎勵結果','查看範圍','目前群組','全部活動','活動詳情','處理時間','暫無資訊','返回獎勵紀錄','暫無獎勵紀錄。到群組活動中尋找想參與的活動吧。','無法查看此紀錄。','未提供原因','未提供更正原因','詳情','抽獎券','原有免費抽獎券','任務參與','活動參與','歷史活動','抽獎報名'],
 es:['Recompensas del grupo','Resultado de participación y recompensas','Ámbito','Grupo actual','Todas las actividades','Detalles de la actividad','Fecha de procesamiento','Sin información','Volver a recompensas','Aún no hay recompensas. Busca actividades del grupo en las que participar.','Este registro no está disponible.','No se indicó el motivo','No se indicó el motivo de la corrección','Detalles','boletos','boletos gratuitos anteriores','Participación en misión','Participación en actividad','Actividad anterior','Participación en sorteo'],
 id:['Riwayat hadiah grup','Hasil partisipasi dan hadiah','Cakupan','Grup saat ini','Semua aktivitas','Detail aktivitas','Waktu diproses','Tidak ada informasi','Kembali ke riwayat hadiah','Belum ada riwayat hadiah. Temukan aktivitas yang bisa diikuti di grup ini.','Catatan ini tidak tersedia.','Alasan tidak diberikan','Alasan koreksi tidak diberikan','Detail','tiket','tiket gratis lama','Partisipasi misi','Partisipasi aktivitas','Aktivitas sebelumnya','Pendaftaran undian'],
 vi:['Lịch sử thưởng của nhóm','Kết quả tham gia và nhận thưởng','Phạm vi','Nhóm hiện tại','Tất cả hoạt động','Chi tiết hoạt động','Thời gian xử lý','Không có thông tin','Về lịch sử thưởng','Chưa có lịch sử thưởng. Hãy tìm hoạt động để tham gia trong nhóm.','Không thể xem bản ghi này.','Không cung cấp lý do','Không cung cấp lý do điều chỉnh','Chi tiết','vé dự thưởng','vé miễn phí cũ','Tham gia nhiệm vụ','Tham gia hoạt động','Hoạt động trước đây','Tham gia rút thăm'],
 th:['ประวัติรางวัลของกลุ่ม','ผลการเข้าร่วมและรับรางวัล','ขอบเขต','กลุ่มปัจจุบัน','กิจกรรมทั้งหมด','รายละเอียดกิจกรรม','เวลาที่ดำเนินการ','ไม่มีข้อมูล','กลับไปยังประวัติรางวัล','ยังไม่มีประวัติรางวัล ลองหากิจกรรมที่ต้องการเข้าร่วมในกลุ่ม','ไม่สามารถดูรายการนี้ได้','ไม่ได้ระบุเหตุผล','ไม่ได้ระบุเหตุผลการปรับปรุง','รายละเอียด','ตั๋วชิงรางวัล','ตั๋วฟรีเดิม','การเข้าร่วมภารกิจ','การเข้าร่วมกิจกรรม','กิจกรรมก่อนหน้า','การเข้าร่วมจับรางวัล'],
 pt:['Recompensas do grupo','Resultado da participação e recompensas','Âmbito','Grupo atual','Todas as atividades','Detalhes da atividade','Data do processamento','Sem informação','Voltar às recompensas','Ainda não há recompensas. Encontre atividades para participar neste grupo.','Este registo está indisponível.','Motivo não informado','Motivo da correção não informado','Detalhes','bilhetes','bilhetes gratuitos anteriores','Participação em missão','Participação em atividade','Atividade anterior','Participação em sorteio'],
 fr:['Récompenses du groupe','Résultat de participation et récompenses','Périmètre','Groupe actuel','Toutes les activités','Détails de l’activité','Date de traitement','Aucune information','Retour aux récompenses','Aucune récompense pour le moment. Trouvez des activités à rejoindre dans ce groupe.','Cet enregistrement est indisponible.','Motif non fourni','Motif de correction non fourni','Détails','billets','anciens billets gratuits','Participation à une mission','Participation à une activité','Activité précédente','Participation au tirage'],
 ru:['Награды группы','Результат участия и начисления','Область просмотра','Текущая группа','Все активности','Подробности активности','Время обработки','Нет информации','К истории наград','Истории наград пока нет. Найдите в группе активности для участия.','Эта запись недоступна.','Причина не указана','Причина корректировки не указана','Подробнее','билеты','прежние бесплатные билеты','Участие в миссии','Участие в активности','Предыдущая активность','Участие в розыгрыше'],
};
type StatusLabels=readonly [pending:string,rejected:string,credited:string,noReward:string,review:string,corrected:string,entered:string,refunded:string];
const statuses:Record<AppLocale,StatusLabels>={
 ko:['확인 중 · 지급 전','반려 · 지급 전','적립 완료','참여 완료 · 지급 없음','정정 검토 중','적립 정정','응모 완료','응모권 반환'],
 en:['Under review · not paid','Rejected · not paid','Credited','Completed · no reward','Correction under review','Earnings corrected','Entry confirmed','Tickets refunded'],
 ja:['確認中・支給前','却下・支給前','獲得済み','参加完了・報酬なし','訂正審査中','獲得額を訂正','応募完了','応募券返還'],
 'zh-Hans':['审核中 · 未发放','已拒绝 · 未发放','已到账','参与完成 · 无奖励','更正审核中','奖励已更正','报名成功','抽奖券已退回'],
 'zh-Hant':['審核中 · 未發放','已拒絕 · 未發放','已入帳','參與完成 · 無獎勵','更正審核中','獎勵已更正','報名成功','抽獎券已退回'],
 es:['En revisión · sin pagar','Rechazado · sin pagar','Abonado','Completado · sin recompensa','Corrección en revisión','Recompensa corregida','Inscripción confirmada','Boletos devueltos'],
 id:['Ditinjau · belum dibayar','Ditolak · belum dibayar','Hadiah diterima','Selesai · tanpa hadiah','Koreksi sedang ditinjau','Hadiah dikoreksi','Pendaftaran dikonfirmasi','Tiket dikembalikan'],
 vi:['Đang xét duyệt · chưa trả thưởng','Bị từ chối · chưa trả thưởng','Đã nhận thưởng','Hoàn thành · không có thưởng','Đang xét điều chỉnh','Đã điều chỉnh thưởng','Đã tham gia','Đã hoàn vé'],
 th:['กำลังตรวจสอบ · ยังไม่จ่าย','ไม่อนุมัติ · ยังไม่จ่าย','ได้รับรางวัลแล้ว','เสร็จสิ้น · ไม่มีรางวัล','กำลังตรวจสอบการปรับปรุง','ปรับปรุงรางวัลแล้ว','เข้าร่วมแล้ว','คืนตั๋วแล้ว'],
 pt:['Em análise · não pago','Rejeitado · não pago','Creditado','Concluído · sem recompensa','Correção em análise','Recompensa corrigida','Inscrição confirmada','Bilhetes devolvidos'],
 fr:['En cours d’examen · non versé','Refusé · non versé','Crédité','Terminé · sans récompense','Correction en cours d’examen','Récompense corrigée','Inscription confirmée','Billets remboursés'],
 ru:['На проверке · не выплачено','Отклонено · не выплачено','Начислено','Завершено · без награды','Корректировка на проверке','Награда скорректирована','Участие подтверждено','Билеты возвращены'],
};
const failures:Record<AppLocale,readonly [string,string]>={
 ko:['내역을 불러오지 못했어요.','다시 불러오기'],en:['Could not load the history.','Reload'],ja:['履歴を読み込めませんでした。','再読み込み'],
 'zh-Hans':['无法加载记录。','重新加载'],'zh-Hant':['無法載入紀錄。','重新載入'],es:['No se pudo cargar el historial.','Volver a cargar'],
 id:['Riwayat tidak dapat dimuat.','Muat ulang'],vi:['Không tải được lịch sử.','Tải lại'],th:['ไม่สามารถโหลดประวัติได้','โหลดใหม่'],
 pt:['Não foi possível carregar o histórico.','Recarregar'],fr:['Impossible de charger l’historique.','Recharger'],ru:['Не удалось загрузить историю.','Загрузить снова'],
};
export function groupEarningsCopy(locale:AppLocale){
 const [title,result,scope,currentGroup,all,activity,processed,unknown,back,empty,unavailable,noReason,correctionNoReason,detail,tickets,legacyTickets,mission,participation,legacyActivity,raffle]=labels[locale];
 const [pending,rejected,credited,no_reward,correction_review,corrected,entered,refunded]=statuses[locale];
 const [error,reload]=failures[locale];
 return {title,result,scope,currentGroup,all,activity,processed,unknown,back,empty,error,reload,unavailable,noReason,correctionNoReason,detail,tickets,legacyTickets,kinds:{mission,activity:participation,legacy_activity:legacyActivity,raffle},statuses:{pending,rejected,credited,no_reward,correction_review,corrected,entered,refunded}};
}
export function groupEarningTitle(entry:GroupEarningEntry,locale:AppLocale){
 // Unknown activity keys never acquire an invented attendance/comment title.
 return entry.title ?? groupEarningsCopy(locale).kinds[entry.kind];
}
export function groupEarningAmount(entry:GroupEarningEntry,locale:AppLocale){
 if(entry.status!=='credited'||entry.netAmount===null)return null;
 const c=groupEarningsCopy(locale),number=new Intl.NumberFormat(locale,{signDisplay:'exceptZero'}).format(entry.netAmount);
 return entry.asset==='fan_point'?`${number}P`:`${number} ${entry.asset==='ticket'?c.tickets:c.legacyTickets}`;
}
export function groupEarningsHref(pageId:string,locale:AppLocale,cursor?:string,entryKey?:string){
 const query=new URLSearchParams({locale});if(cursor)query.set('cursor',cursor);
 return `/pages/groups/${pageId}/earnings${entryKey?`/${encodeURIComponent(entryKey)}`:''}?${query}`;
}
