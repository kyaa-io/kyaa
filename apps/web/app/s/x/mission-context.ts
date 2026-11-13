import { kolPropertiesSchema } from '@/features/analytics/domain/x-mission-attribution';
export function missionLocale(explicit: string | undefined, browserLanguage: string): 'ko' | 'en' {
 return explicit === 'ko' || explicit === 'en' ? explicit : /^ko(?:-|,|;|$)/i.test(browserLanguage) ? 'ko' : 'en';
}
export function missionAttribution(search: string, now = Date.now()) {
 const q = new URLSearchParams(search), started = q.get('x_started');
 const validStart = started && Number.isFinite(Date.parse(started)) && Date.parse(started) <= now && Date.parse(started) >= now - 60 * 60_000 ? started : null;
 const result = kolPropertiesSchema.safeParse({ source:q.get('utm_source'), medium:q.get('utm_medium'), campaign:q.get('utm_campaign'), kol:q.get('utm_content'), flowStartedAt:validStart });
 return result.success ? result.data : null;
}
export const isXBrowser = (ua: string) => /\bTwitter(?:Android| for iPhone| for iPad|\/|\b)|\bX\/\d/i.test(ua);
