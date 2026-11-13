import { expect, it } from 'vitest';
import { missionAttribution, missionLocale, isXBrowser } from './mission-context';
import { clientProductEventV1Schema } from '@/features/analytics/domain/product-event';
it('prefers an explicit locale and otherwise uses Korean browser language only', () => {
 expect(missionLocale('en','ko-KR')).toBe('en'); expect(missionLocale('ko','en-US')).toBe('ko');
 expect(missionLocale(undefined,'ko-KR,ko;q=0.9,en;q=0.8')).toBe('ko'); expect(missionLocale(undefined,'ja-JP')).toBe('en');
});
it('accepts only the public KoL campaign and bounded flow start', () => {
 const q='?utm_source=x&utm_medium=kol&utm_campaign=kol-1113&utm_content=kol01';
 expect(missionAttribution(q)?.kol).toBe('kol01'); expect(missionAttribution(q)?.flowStartedAt).toBeNull();
 expect(missionAttribution(q.replace('kol01','private-person'))).toBeNull();
 expect(missionAttribution(q+'&x_started=2026-11-13T07:00:00.000Z',Date.parse('2026-11-13T07:05:00Z'))?.flowStartedAt).toBe('2026-11-13T07:00:00.000Z');
 expect(missionAttribution(q+'&x_started=2020-01-01T00:00:00.000Z')?.flowStartedAt).toBeNull();
});
it('recognizes X app markers without classifying ordinary Safari/Chrome as X', () => {
 expect(isXBrowser('Mozilla Android TwitterAndroid/10.0')).toBe(true); expect(isXBrowser('Mozilla iPhone Twitter for iPhone')).toBe(true); expect(isXBrowser('Mozilla Safari Chrome')).toBe(false);
});
it('rejects anonymous or unbounded X attribution at the shared events boundary', () => {
 const e={schemaVersion:1,eventName:'creator_page_view',anonymousSessionId:null,celebrityId:null,liveEventId:null,missionId:null,benefitId:null,source:'x_mission.identified',idempotencyKey:'mission:kol01:12345678',occurredAt:new Date().toISOString(),properties:{source:'x',medium:'kol',campaign:'kol-1113',kol:'kol01',flowStartedAt:null}};
 expect(clientProductEventV1Schema.safeParse(e).success).toBe(true);
 expect(clientProductEventV1Schema.safeParse({...e,anonymousSessionId:'anonymous-session-123'}).success).toBe(false);
 expect(clientProductEventV1Schema.safeParse({...e,properties:{...e.properties,rawUrl:'https://private'}}).success).toBe(false);
});
