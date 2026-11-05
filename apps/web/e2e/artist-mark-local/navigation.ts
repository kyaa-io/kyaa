// 합성 하니스 전용: 미션 화면이 제출 뒤 router.push로 새로 로드하지 않도록, mission 뷰에서만 push를 막는다.
import * as base from '../groups-local/navigation.ts';
export * from '../groups-local/navigation.ts';
const hold = new URLSearchParams(location.search).get('view') === 'mission';
export const useRouter = () => { const r = base.useRouter(); return hold ? { ...r, push: () => {} } : r; };
