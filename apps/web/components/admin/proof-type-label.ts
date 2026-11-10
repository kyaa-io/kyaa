export const PROOF_TYPE_LABEL: Record<string, { ko: string; en: string }> = {
  membership: { ko: "멤버십", en: "Membership" },
  purchase: { ko: "구매", en: "Purchase" },
  receipt: { ko: "영수증", en: "Receipt" },
  ticket: { ko: "티켓", en: "Ticket" },
  donation: { ko: "후원", en: "Donation" },
  funding: { ko: "펀딩", en: "Funding" },
  kyaa_payment: { ko: "kyaa 결제", en: "kyaa payment" },
  sns_post: { ko: "SNS 올리기", en: "SNS post" },
};

export function proofTypeLabel(type: string, locale: "ko" | "en") {
  return PROOF_TYPE_LABEL[type]?.[locale] ?? type;
}
