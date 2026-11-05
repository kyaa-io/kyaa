// 합성 광고 스텁: 광고 SDK 없이 상태만 흉내 낸다. 운영·dev 증거 아님.
type S = 'loading' | 'ready' | 'showing' | 'earned' | 'closed' | 'cancelled' | 'no-fill' | 'unsupported' | 'error';
const w = window as unknown as { __unit?: string | null; __plan?: string[]; __ads: number };
w.__ads = 0;
export const rewardedAdUnit = () => (new URLSearchParams(location.search).get('unit') === 'none' ? undefined : '/123/rewarded');
export const loadRewardedGpt = async () => ({});
export function requestRewardedAd(_g: unknown, _u: string, onState: (s: S) => void) {
  const outcome = (w.__plan ?? [])[w.__ads++] ?? 'earn';
  onState('loading');
  setTimeout(() => onState('ready'), 120);
  return {
    show() { onState('showing'); setTimeout(() => { if (outcome === 'earn') { onState('earned'); setTimeout(() => onState('closed'), 150); } else onState('cancelled'); }, 450); return true; },
    cancel() { onState('cancelled'); },
  };
}
export type RewardedAdState = S;
export type RewardedGpt = object;
