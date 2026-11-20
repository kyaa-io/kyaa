import type { AppLocale } from "@/i18n/locales";

type Labels = Record<"missionReview" | "stampReview" | "groupOverview" | "groupApplications" | "giftApplications", string>;

export const adminReviewLabels = {
  "ko": { missionReview: "미션 인증 심사", stampReview: "스탬프 증빙 심사", groupOverview: "모임 요약", groupApplications: "모임 개설 신청", giftApplications: "선물 등록 신청" },
  "en": { missionReview: "Mission submission review", stampReview: "Stamp proof review", groupOverview: "Group overview", groupApplications: "Group applications", giftApplications: "Gift applications" },
  "ja": { missionReview: "ミッション提出物の審査", stampReview: "スタンプ証明の審査", groupOverview: "グループ概要", groupApplications: "グループ開設申請", giftApplications: "ギフト登録申請" },
  "zh-Hans": { missionReview: "任务提交审核", stampReview: "印章凭证审核", groupOverview: "社群概览", groupApplications: "社群创建申请", giftApplications: "礼物登记申请" },
  "zh-Hant": { missionReview: "任務提交審核", stampReview: "印章憑證審核", groupOverview: "社群總覽", groupApplications: "社群建立申請", giftApplications: "禮物登記申請" },
  "es": { missionReview: "Revisión de misiones enviadas", stampReview: "Revisión de pruebas para sellos", groupOverview: "Resumen de grupos", groupApplications: "Solicitudes de creación de grupos", giftApplications: "Solicitudes de registro de regalos" },
  "id": { missionReview: "Tinjau kiriman misi", stampReview: "Tinjau bukti stempel", groupOverview: "Ringkasan grup", groupApplications: "Permohonan pembuatan grup", giftApplications: "Permohonan pendaftaran hadiah" },
  "vi": { missionReview: "Duyệt bài nộp nhiệm vụ", stampReview: "Duyệt minh chứng nhận dấu", groupOverview: "Tổng quan nhóm", groupApplications: "Đơn mở nhóm", giftApplications: "Đơn đăng ký quà tặng" },
  "th": { missionReview: "ตรวจผลงานภารกิจ", stampReview: "ตรวจหลักฐานรับตราประทับ", groupOverview: "ภาพรวมกลุ่ม", groupApplications: "คำขอเปิดกลุ่ม", giftApplications: "คำขอลงทะเบียนของขวัญ" },
  "pt": { missionReview: "Análise de missões enviadas", stampReview: "Análise de comprovantes para selos", groupOverview: "Visão geral dos grupos", groupApplications: "Pedidos de criação de grupos", giftApplications: "Pedidos de registro de presentes" },
  "fr": { missionReview: "Examen des missions soumises", stampReview: "Examen des justificatifs de tampon", groupOverview: "Aperçu des groupes", groupApplications: "Demandes de création de groupe", giftApplications: "Demandes d’enregistrement de cadeaux" },
  "ru": { missionReview: "Проверка выполненных заданий", stampReview: "Проверка подтверждений для штампов", groupOverview: "Обзор групп", groupApplications: "Заявки на создание групп", giftApplications: "Заявки на регистрацию подарков" },
} satisfies Record<AppLocale, Labels>;
