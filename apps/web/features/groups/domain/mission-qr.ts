import { z } from 'zod';
export function groupMissionQr(value:string,origin:string,pageId:string):string|null{
 try{
  if(value.length>2048||/[\\\u0000-\u0020]/.test(value))return null;
  const url=new URL(value,origin),parts=url.pathname.split('/');
  if(url.origin!==origin||url.username||url.password||url.hash||parts.length!==6||parts[1]!=='pages'||parts[2]!=='groups'||parts[3]!==pageId||parts[4]!=='missions'||!z.uuid().safeParse(parts[5]).success)return null;
  return url.pathname;
 }catch{return null;}
}
