export function resolveLocale(search, preference) {
  const language = new URLSearchParams(search).get('lang');
  return ['ko', 'en'].includes(language) ? language : preference === 'en' ? 'en' : 'ko';
}
export function inquiryUrl({name, email, interest}, locale) {
  const interests = {salon: ['엔터테크 살롱', 'Entertech salon'], creator: ['크리에이터 커뮤니티', 'Creator community'], partnership: ['협업 문의', 'Partnership inquiry']};
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\r\n]/.test(name) || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Object.hasOwn(interests, interest)) throw new Error('Invalid inquiry');
  const en = locale === 'en';
  const topic = interests[interest][en ? 1 : 0];
  const query = new URLSearchParams({subject: `[kyaa wave] ${topic}`, body: en ? `Name: ${name.trim()}\nEmail: ${email.trim()}\nInterest: ${topic}\n\nMy inquiry:\n` : `이름: ${name.trim()}\n이메일: ${email.trim()}\n관심 분야: ${topic}\n\n문의 내용:\n`});
  return `mailto:biz@sallylab.io?${query}`;
}
// Keep sensitive-link exclusions aligned with apps/web/features/analytics/domain/outbound-link.ts.
const sensitiveKey = /^(?:x-amz-|x-goog-|oauth)|(?:token|signature|secret|credential|session|authorization)|(?:^|_)(?:sig|auth|code|state|redirect_uri|redirect_url|key)(?:$|_)|^(?:apiKey|clientKey|redirectUri|redirectUrl)$/i;
const sensitivePath = /(?:^|\/)(?:oauth[^/]*|authorize|authorization|callback|login|signin|sign-in|checkout|payments?|pay|receipt|download)(?:\/|$)/i;
const sensitiveHost = /(?:^|\.)(?:accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|privy\.io|stripe\.com|paypal\.com|pay\.naver\.com)$/i;
function publicOutboundUrl(href) {
  try {
    const url = new URL(href);
    const fragment = url.hash.slice(1);
    const fragmentParams = new URLSearchParams(fragment.includes('?') ? fragment.slice(fragment.indexOf('?') + 1) : fragment);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port
      || sensitiveHost.test(url.hostname) || sensitivePath.test(url.pathname)
      || /\.(?:pdf|zip|csv|xlsx?|docx?|hwpx?|png|jpe?g|webp|gif|mp[34])$/i.test(url.pathname)
      || sensitivePath.test(fragment.split('?')[0])
      || [...url.searchParams.keys(), ...fragmentParams.keys()].some(key => sensitiveKey.test(key))) return null;
    return url;
  } catch { return null; }
}
export function decorateOutboundUrl(href, placement = 'content') {
  const parsed = publicOutboundUrl(href);
  if (!parsed) return href;
  const [base, hash] = href.split(/#(.*)/s);
  const existingKeys = new Set([...parsed.searchParams.keys()].map(key => key.toLowerCase()));
  const defaults = {utm_source:'kyaa', utm_medium:'referral', utm_campaign:'kyaa-wave', utm_content:`${placement}.website`};
  const additions = new URLSearchParams(Object.entries(defaults).filter(([key]) => !existingKeys.has(key))).toString();
  return base + (additions ? (base.includes('?') ? /[?&]$/.test(base) ? '' : '&' : '?') + additions : '') + (hash === undefined ? '' : `#${hash}`);
}
export function isTrackedOutboundUrl(href) {
  const url = publicOutboundUrl(href);
  return Boolean(url && url.protocol === 'https:' && url.hostname === 'kyaa.io' && ['/', '/connect/kyaa-wave'].includes(url.pathname));
}
