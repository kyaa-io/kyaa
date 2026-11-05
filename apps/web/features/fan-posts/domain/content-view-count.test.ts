import {expect,it} from 'vitest';
import {postPageSchema,postSchema} from './content';
const id='00000000-0000-4000-8000-000000000001',at='2026-11-05T01:00:00+09:00';
const post={id,celebritySlug:'artist',body:'본문',visibility:'public',revision:1,author:{nickname:'팬',avatarUrl:'/images/avatars/star-pink.webp'},assets:[],createdAt:at,updatedAt:at,isOwner:false,likeCount:2,liked:false,commentCount:0};
it('accepts the optional view count on the post detail and list, and still rejects unknown fields',()=>{
 expect(postSchema.parse({...post,viewCount:12}).viewCount).toBe(12);
 expect(postSchema.parse(post).viewCount).toBeUndefined();
 expect(postPageSchema.parse({items:[{...post,viewCount:0}],nextCursor:null}).items[0]?.viewCount).toBe(0);
 expect(()=>postSchema.parse({...post,viewCount:-1})).toThrow();
 expect(()=>postSchema.parse({...post,extra:1})).toThrow();
});
