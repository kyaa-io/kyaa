import type {AppLocale} from '@/i18n/locales';
const ko = {title:'모임 설문',comments:'추가 의견 · 선택',placeholder:'자유롭게 의견을 남겨주세요.',error:'제출하지 못했어요. 입력한 내용은 유지돼요.',submit:'응답 제출'};
const copy: Record<AppLocale, typeof ko> = {
 ko,
 en:{title:'Group survey',comments:'Additional comments · optional',placeholder:'Share any additional comments.',error:'Unable to submit. Your answers are still here.',submit:'Submit response'},
 ja:{title:'グループアンケート',comments:'追加のご意見 · 任意',placeholder:'ご意見を自由にお書きください。',error:'送信できませんでした。入力した回答は保持されています。',submit:'回答を送信'},
 'zh-Hans':{title:'小组问卷',comments:'补充意见 · 选填',placeholder:'请留下您的意见。',error:'提交失败。已保留您填写的回答。',submit:'提交回答'},
 'zh-Hant':{title:'社群問卷',comments:'補充意見 · 選填',placeholder:'請留下您的意見。',error:'提交失敗。已保留您填寫的回答。',submit:'提交回答'},
 es:{title:'Encuesta del grupo',comments:'Comentarios adicionales · opcional',placeholder:'Comparte cualquier comentario adicional.',error:'No se pudo enviar. Tus respuestas se conservan.',submit:'Enviar respuesta'},
 id:{title:'Survei grup',comments:'Komentar tambahan · opsional',placeholder:'Bagikan komentar tambahan Anda.',error:'Tidak dapat mengirim. Jawaban Anda tetap tersimpan.',submit:'Kirim jawaban'},
 vi:{title:'Khảo sát nhóm',comments:'Ý kiến bổ sung · không bắt buộc',placeholder:'Hãy chia sẻ thêm ý kiến của bạn.',error:'Không thể gửi. Câu trả lời của bạn vẫn được giữ lại.',submit:'Gửi câu trả lời'},
 th:{title:'แบบสำรวจกลุ่ม',comments:'ความคิดเห็นเพิ่มเติม · ไม่บังคับ',placeholder:'แสดงความคิดเห็นเพิ่มเติมได้ตามต้องการ',error:'ส่งไม่สำเร็จ คำตอบที่กรอกไว้ยังอยู่',submit:'ส่งคำตอบ'},
 pt:{title:'Pesquisa do grupo',comments:'Comentários adicionais · opcional',placeholder:'Compartilhe comentários adicionais.',error:'Não foi possível enviar. Suas respostas foram mantidas.',submit:'Enviar resposta'},
 fr:{title:'Questionnaire du groupe',comments:'Commentaires supplémentaires · facultatif',placeholder:'Partagez vos commentaires supplémentaires.',error:'Impossible d’envoyer. Vos réponses sont conservées.',submit:'Envoyer la réponse'},
 ru:{title:'Опрос группы',comments:'Дополнительный комментарий · необязательно',placeholder:'Оставьте дополнительные комментарии.',error:'Не удалось отправить. Ваши ответы сохранены.',submit:'Отправить ответ'},
};
export function groupSurveyCopy(locale:AppLocale){return copy[locale];}
