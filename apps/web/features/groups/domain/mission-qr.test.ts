import { expect,it } from 'vitest';
import { groupMissionQr } from './mission-qr';
const page='e9200000-0000-4000-8000-000000000001',mission='e9200000-0000-4000-8000-000000000002',origin='https://dev.kyaa.io',path=`/pages/groups/${page}/missions/${mission}`;
it('accepts only a mission in this group and drops scanned query values',()=>{expect(groupMissionQr(origin+path+'?locale=en&token=discard',origin,page)).toBe(path);expect(groupMissionQr(path,origin,page)).toBe(path);});
it.each(['https://other.example'+path,'https://user:secret@dev.kyaa.io'+path,path+'#fragment',path.replace(page,mission),path.replace('/missions/','/events/'),path+'/extra',path.replace(mission,'not-a-uuid'),'javascript:alert(1)','\\\\evil.example'+path])('rejects unrelated or malformed QR %s',value=>{expect(groupMissionQr(value,origin,page)).toBeNull();});
