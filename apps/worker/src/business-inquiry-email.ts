import type { BusinessInquiry } from "./business-inquiry-worker.js";

export const inquiryEmailLabels = {
  fanmeeting: "미국 팬미팅 문의",
  creator: "팬 활동 문의",
  partner: "파트너 협업 문의",
  wave_creator: "크리에이터 문의",
  wave_partner: "파트너십 문의",
} as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

/** A bounded excerpt of the submitter's words, without inventing a summary. */
export function inquirySubjectExcerpt(message: string): string {
  const normalized = message.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/gu, " ").trim();
  const graphemes = Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(normalized), part => part.segment);
  return graphemes.length > 60 ? `${graphemes.slice(0, 59).join("")}…` : normalized;
}

export function renderBusinessInquiryEmail(job: BusinessInquiry) {
  const label = inquiryEmailLabels[job.inquiry_type ?? "fanmeeting"];
  const excerpt = inquirySubjectExcerpt(job.message);
  const brand = job.inquiry_type?.startsWith("wave_") ? "kyaa wave" : "kyaa";
  const subject = `[${brand} ${label}]${excerpt ? ` ${excerpt}` : ""}`;
  const text = [
    ...(brand === "kyaa wave" ? [brand, ""] : []), label, "", `담당자: ${job.contact_name}`, `소속: ${job.company}`,
    `회신 이메일: ${job.email}`, "", "문의 내용", job.message, "",
    "이 메일에 답장하면 문의자에게 전달됩니다.",
  ].join("\n");
  const font = "font-family:Pretendard,'Apple SD Gothic Neo','Malgun Gothic',Arial,sans-serif;";
  const details = ([["담당자", job.contact_name], ["소속", job.company], ["회신 이메일", job.email]] as const).map(([name, value]) =>
    `<tr><th scope="row" align="left" valign="top" style="width:84px;padding:7px 12px 7px 0;font-size:14px;line-height:22px;font-weight:400;color:#666666;">${name}</th><td style="padding:7px 0;font-size:15px;line-height:22px;color:#181818;overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(value)}</td></tr>`,
  ).join("");
  const messageHtml = escapeHtml(job.message).replace(/\r\n|\r|\n/g, "<br>");
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f6f8;${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:#f6f6f8;"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;table-layout:fixed;background:#ffffff;border:1px solid #e7e7eb;border-radius:16px;overflow:hidden;">
<tr><td style="height:4px;background:#d946bf;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:28px 24px 24px;${font}">
<p style="margin:0 0 24px;font-size:22px;line-height:28px;font-weight:800;letter-spacing:-1px;color:#181818;">${brand === "kyaa wave" ? "kyaa wave" : 'By<span style="color:#d946bf;">Us.</span>'}</p>
<h1 style="margin:0 0 24px;font-size:24px;line-height:34px;font-weight:700;color:#181818;">${label}</h1>
<table aria-label="문의자 정보" width="100%" cellpadding="0" cellspacing="0" style="width:100%;table-layout:fixed;${font}">${details}</table>
<h2 style="margin:24px 0 12px;padding-top:24px;border-top:1px solid #e7e7eb;font-size:14px;line-height:22px;font-weight:700;color:#666666;">문의 내용</h2>
<div lang="${job.locale}" style="font-size:16px;line-height:28px;color:#181818;overflow-wrap:anywhere;word-break:break-word;white-space:pre-wrap;">${messageHtml}</div>
</td></tr>
<tr><td style="padding:18px 24px;background:#fafafa;border-top:1px solid #eeeeee;${font}font-size:13px;line-height:21px;color:#666666;">이 메일에 답장하면 문의자에게 전달됩니다.</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

export function renderCsReceipt(job: { id: string; locale: "ko" | "en"; body: string }) {
  const ko = job.locale === "ko";
  const heading = ko ? "문의를 접수했어요" : "We’ve received your inquiry";
  const number = job.id.slice(0, 8).toUpperCase();
  const subject = `[kyaa] ${heading} (#${number})`;
  const excerpt = inquirySubjectExcerpt(job.body);
  const note = ko ? "내용을 확인한 후 이메일로 답변드릴게요." : "We’ll review your message and reply by email.";
  const footer = ko ? "앞으로도 다양한 경품으로 럭키드로우 이벤트를 진행할 예정입니다. 사이트에 종종 방문해 주시고 많은 관심 부탁드립니다." : "We’ll keep hosting lucky draws with a variety of prizes. Please visit us often, and thank you for your support.";
  const home = "https://kyaa.io/?utm_source=kyaa&utm_medium=email&utm_campaign=cs_receipt&utm_content=cs_receipt_footer";
  const instagramLabel = ko ? "공식 인스타그램 @kyaa_app" : "Official Instagram @kyaa_app";
  const instagram = "https://www.instagram.com/kyaa_app/";
  const action = ko ? "kyaa 바로가기" : "Visit kyaa";
  return {
    subject,
    text: [heading, `#${number}`, excerpt, note, footer, `${action} · ${home}`, `${instagramLabel} · ${instagram}`].join("\n\n"),
    html: `<main lang="${job.locale}" style="max-width:560px;margin:32px auto;padding:24px;font:16px/1.6 Arial,sans-serif;color:#242124"><strong>kyaa</strong><h1>${heading}</h1><p>#${escapeHtml(number)}</p><blockquote style="margin:16px 0;padding:16px;background:#faf6fa;overflow-wrap:anywhere">${escapeHtml(excerpt)}</blockquote><p>${note}</p><hr><p>${footer}</p><p><a style="display:inline-block;padding:10px 20px;background:#242124;color:white;border-radius:8px;text-decoration:none" href="${escapeHtml(home)}">${action}</a></p><p><a href="${instagram}">${instagramLabel}</a></p></main>`,
  };
}
