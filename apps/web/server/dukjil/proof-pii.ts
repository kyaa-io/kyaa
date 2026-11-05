// Server-side personal-information pattern check for proof text (contract §3.6, plan §6). The result is passed to the database
// as p_pii_detected. Image masking happens in the browser before upload; OCR of the image is a later step (plan §11 P3).
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;
const PHONE = /(?<!\d)(?:\+?82[-\s.]?)?0?(?:1[016-9]|2|[3-6][1-5]|70)[-\s.]?\d{3,4}[-\s.]?\d{4}(?!\d)/;
const RESIDENT_ID = /(?<!\d)\d{6}[-\s]?[1-8]\d{6}(?!\d)/;
const LONG_NUMBER = /(?<!\d)\d(?:[-\s.]?\d){9,}(?!\d)/;

function luhn(digits: string) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let n = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

function hasCardNumber(text: string) {
  for (const match of text.matchAll(/(?<!\d)\d(?:[-\s]?\d){12,18}(?!\d)/g)) {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true;
  }
  return false;
}

export function containsPersonalInfo(input: string | null | undefined): boolean {
  if (!input) return false;
  const text = input.normalize("NFKC");
  return EMAIL.test(text) || RESIDENT_ID.test(text) || PHONE.test(text) || hasCardNumber(text) || LONG_NUMBER.test(text);
}
