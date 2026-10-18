export function resolveLocale(search, preference) {
  const language = new URLSearchParams(search).get('lang');
  return ['ko', 'en'].includes(language) ? language : preference === 'en' ? 'en' : 'ko';
}
export const ACQUISITION_CHANNELS = ['google', 'bing', 'naver', 'telegram', 'direct', 'other'];
export function acquisitionChannel(search, referrer) {
  const source = new URLSearchParams(search).get('utm_source');
  if (source) return ACQUISITION_CHANNELS.includes(source.toLowerCase()) ? source.toLowerCase() : 'other';
  if (!referrer) return 'direct';
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    const matches = domain => host === domain || host.endsWith(`.${domain}`);
    if (matches('google.com') || matches('google.co.kr')) return 'google';
    if (matches('bing.com')) return 'bing';
    if (matches('naver.com')) return 'naver';
    if (host === 't.me' || matches('telegram.org')) return 'telegram';
  } catch { /* Unknown referrers remain an anonymous category. */ }
  return 'other';
}
export const GATHERING_END = Date.parse('2026-10-22T21:30:00+09:00');
export function gatheringHasEnded(now = Date.now()) { return now >= GATHERING_END; }
export function validateInquiry({name, email, interest, message, website = '', consent, sessionId, channel}, locale) {
  if (typeof name !== 'string' || !name.trim() || name.length > 80 || /[\r\n]/.test(name)
    || typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !['creator', 'partnership'].includes(interest)
    || typeof message !== 'string' || !message.trim() || message.length > 4000
    || typeof website !== 'string' || website.length > 200 || consent !== true
    || typeof sessionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId) || !ACQUISITION_CHANNELS.includes(channel)) throw new Error('Invalid inquiry');
  return {name:name.trim(), email:email.trim(), interest, message:message.trim(), locale:locale === 'en' ? 'en' : 'ko', website, consent, sessionId, channel};
}
export function createInquirySubmission(send, makeId) {
  let request, busy = false, state = 'idle';
  return {
    get busy() { return busy; },
    get state() { return state; },
    get requestId() { return request?.requestId; },
    async submit(values, locale) {
      if (busy || state === 'accepted') return state;
      // An uncertain delivery must retry the original payload and idempotency key.
      if (state !== 'unknown') {
        const payload = validateInquiry(values, locale);
        const {requestId, ...previous} = request || {};
        if (!request || JSON.stringify(payload) !== JSON.stringify(previous)) request = {...payload, requestId:makeId()};
      }
      busy = true;
      state = 'sending';
      try {
        const response = await send(request);
        const body = await response.json().catch(() => null);
        state = [200, 202].includes(response.status) && body?.status === 'accepted' ? 'accepted' : response.status >= 400 && response.status < 500 ? 'rejected' : 'unknown';
      } catch { state = 'unknown'; }
      finally { busy = false; }
      return state;
    }
  };
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
export function decorateOutboundUrl(href, placement = 'content', linkKind = 'website') {
  const parsed = publicOutboundUrl(href);
  if (!parsed) return href;
  const [base, hash] = href.split(/#(.*)/s);
  const existingKeys = new Set([...parsed.searchParams.keys()].map(key => key.toLowerCase()));
  const defaults = {utm_source:'kyaa', utm_medium:'referral', utm_campaign:'kyaa-wave', utm_content:`${placement}.${linkKind === 'social' ? 'social' : 'website'}`};
  const additions = new URLSearchParams(Object.entries(defaults).filter(([key]) => !existingKeys.has(key))).toString();
  return base + (additions ? (base.includes('?') ? /[?&]$/.test(base) ? '' : '&' : '?') + additions : '') + (hash === undefined ? '' : `#${hash}`);
}
export function isTrackedOutboundUrl(href) {
  const url = publicOutboundUrl(href);
  return Boolean(url && url.protocol === 'https:' && ((url.hostname === 'kyaa.io' && ['/', '/connect/kyaa-wave'].includes(url.pathname)) || (url.hostname === 't.me' && url.pathname === '/Kyaa_Official')));
}
