import type {SelectedBias} from '../../features/selected-bias/ui/use-selected-bias';
const q=new URLSearchParams(location.search);
export const favorite={slug:'duo-fixture',name:q.has('long')?'합성 긴 이름 '.repeat(12):'[합성] 랭킹 확인 페이지',image:'/images/groups/capsule-machine.png',passportId:'10000000-0000-4000-8000-000000000003',tier:'Silver' as const,stage:null,hearts:q.has('long')?12345678:0};
export function useSelectedBias():SelectedBias{return {status:q.get('auth')==='off'?'guest':q.get('state')==='no-favorite'?'empty':'ready',options:[favorite],selected:q.get('auth')==='off'||q.get('state')==='no-favorite'?null:favorite,unverified:null,select:()=>{},retry:()=>{}};}
