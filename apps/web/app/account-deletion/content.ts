import type { AppLocale } from "@/i18n/locales";
import { additionalLocales } from "@/i18n/messages";
import { messages } from "@/i18n/catalogs/app__account-deletion__page";

export type AccountDeletionCopy = {
  title: string;
  description: string;
  requestHeading: string;
  appRequest: string;
  emailRequest: string;
  deletedHeading: string;
  deleted: string;
  retainedHeading: string;
  retained: string;
  timingHeading: string;
  timing: string;
};

export const accountDeletionCopy = {
  ko: {
    title: "kyaa 계정 삭제",
    description: "Sallylab Inc.가 운영하는 kyaa의 계정과 개인정보 삭제를 요청하는 방법입니다. 이 안내는 로그인 없이 볼 수 있습니다.",
    requestHeading: "삭제 요청 방법",
    appRequest: "앱에서 로그인한 뒤 Passport → 설정 → 계정 삭제로 이동하세요. 삭제 안내를 읽고 확인란을 선택한 뒤 계정 삭제 버튼을 누르세요. 삭제 요청이 접수되면 계정 이용이 중지됩니다.",
    emailRequest: "앱을 이용할 수 없다면 아래 이메일로 계정에 등록한 이메일 주소와 계정 삭제 요청을 보내세요. 본인 확인을 요청할 수 있습니다. 비밀번호나 인증 코드는 보내지 마세요.",
    deletedHeading: "삭제하거나 지우는 정보",
    deleted: "로그인 계정, 이메일·닉네임·프로필·연락처, 연결 인증 정보, 알림 수신 정보, 혜택 수령 개인정보와 업로드 파일을 삭제하거나 지웁니다. 본인이 쓴 게시글·댓글·문의·설문 자유 응답·DM 본문은 삭제하거나 삭제된 내용으로 대체합니다.",
    retainedHeading: "남는 기록과 보관 기간",
    retained: "개인 연락 정보가 제거된 계정 식별값 아래 거래·보상·혜택·참여·발급 및 감사 이력이 남습니다. 삭제한 인증 계정의 재생성을 막기 위한 해시도 보관합니다. 이 기록과 해시에는 현재 자동 만료 기한이 없습니다. 블록체인에 이미 기록된 Passport·Stamp 발급 기록은 공개된 채로 남으며 삭제할 수 없습니다. 관계 법령에 따른 보관이 필요한 정보는 해당 목적과 기간에 한해 별도로 보관할 수 있습니다.",
    timingHeading: "처리 중 상태와 수령 정보",
    timing: "삭제는 지체 없이 진행하며, 외부 로그인 계정과 저장 파일의 정리가 끝날 때까지 처리 중으로 표시될 수 있습니다. 정해진 완료 기한을 안내하지는 않습니다. 실물 혜택 수령 정보는 기존 개인정보처리방침에 따라 배송 또는 현장 수령 완료 후 30일이 지나면 삭제하며, 계정 삭제 시에도 정리합니다.",
  },
  en: {
    title: "Delete your kyaa account",
    description: "How to request deletion of your account and personal data in kyaa, operated by Sallylab Inc. You can read this page without signing in.",
    requestHeading: "How to request deletion",
    appRequest: "Sign in to the app and open Passport → Settings → Delete account. Read the deletion notice, select the confirmation checkbox, then press Delete account. Your account is disabled when the request is accepted.",
    emailRequest: "If you cannot use the app, email the address below with your account email address and a request to delete your account. We may ask you to verify ownership. Do not send your password or verification codes.",
    deletedHeading: "Data deleted or erased",
    deleted: "We delete or erase your login account, email, nickname, profile, contact details, connected authentication details, notification subscriptions, private reward recipient details and uploaded files. Your posts, comments, support inquiries, survey free-text answers and DM text are removed or replaced with deleted content.",
    retainedHeading: "Records retained and retention periods",
    retained: "Transaction, reward, benefit, participation, issuance and audit history remains under account identifiers with personal contact details removed. Hashes used to prevent recreation of a deleted authentication account are also retained. These records and hashes currently have no automatic expiry. Passport and Stamp issuance already recorded on a blockchain remains public and cannot be deleted. Information required by law may be kept separately for the applicable purpose and period.",
    timingHeading: "Pending deletion and recipient details",
    timing: "Deletion proceeds without undue delay and may show as pending until external login accounts and stored files have been cleared. We do not specify a fixed completion deadline. Under the existing Privacy Policy, physical reward recipient details are deleted 30 days after delivery or on-site pickup is completed, and are also cleared during account deletion.",
  },
  ...additionalLocales((locale) => messages[locale]),
} satisfies Record<AppLocale, AccountDeletionCopy>;
