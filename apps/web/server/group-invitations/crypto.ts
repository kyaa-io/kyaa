import {createCipheriv,createHash,randomBytes} from 'node:crypto';
export function invitationTokenHash(value:string){return createHash('sha256').update(value).digest('hex');}
export function sealInvitationToken(token:string,invitationId:string,pageId:string,keyHex:string|undefined){
 if(!keyHex||!/^[a-f0-9]{64}$/i.test(keyHex))throw new Error('GROUP_INVITATION_UNAVAILABLE');
 const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(keyHex,'hex'),nonce);
 cipher.setAAD(Buffer.from(JSON.stringify(['group-invitation:v1',invitationId,pageId])));
 const encrypted=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
 return ['v1',nonce.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export const newInvitationToken=()=>randomBytes(32).toString('hex');
