import { z } from 'zod';
import { publicAvatarUrlSchema } from '@/features/profile/domain/avatar';
export const parseSocialProfileLink=(value:unknown)=>z.object({token:z.uuid(),expiresAt:z.iso.datetime({offset:true})}).parse(value);
export const parseSocialLinkedProfile=(value:unknown)=>z.object({
 profile:z.object({id:z.uuid(),nickname:z.string().min(1).max(80),avatarUrl:publicAvatarUrlSchema}),
 favorite:z.object({name:z.string().min(1).max(120)}).nullable().optional(),
 relationship:z.object({friendshipId:z.uuid().nullable(),status:z.enum(['none','incoming','outgoing','friends'])}),
 capabilities:z.object({canRequestFriend:z.boolean()}),isSelf:z.boolean(),
}).parse(value);
export function socialFriendToken(value:string,origin:string):string|null{
 try{const url=new URL(value);if(url.origin!==origin||url.username||url.password||url.pathname!=='/my/friends'||url.searchParams.getAll('friend').length!==1)return null;const token=z.uuid().safeParse(url.searchParams.get('friend'));return token.success?token.data:null;}catch{return null;}
}
