import { z } from "zod";

export const groupKindSchema = z.enum(["fan", "hobby", "brand"]);
export const groupPageSchema = z.object({
  id: z.string().uuid(), kind: groupKindSchema, celebrityId: z.string().uuid().nullable(),
  slug: z.string().nullable(), anonymous:z.boolean().optional(), name: z.string(), description: z.string(),
  imageUrl: z.string().nullable(), question: z.string().nullable(), memberCount: z.number().int().nonnegative(),
  lastSeenAt: z.iso.datetime({offset:true}).nullable().optional(),
});
export const groupListSchema = z.object({ items: z.array(groupPageSchema), totalCount: z.number().int().nonnegative().optional(), nextCursor: z.union([z.string().uuid(),z.string().regex(/^[A-Za-z0-9_-]{1,512}$/)]).nullable() });
export const groupDetailSchema = z.object({ page: groupPageSchema, membership: z.object({ role: z.enum(["owner", "manager", "member"]), joinedAt: z.string() }).nullable(), bookmarked: z.boolean() });
export const applicationReceiptSchema = z.object({ id: z.string().uuid(), status: z.literal("submitted"), pageId: z.null() });
export type GroupPage = z.infer<typeof groupPageSchema>;
export type GroupDetail = z.infer<typeof groupDetailSchema>;
export type GroupList = z.infer<typeof groupListSchema>;

export function groupHref(page: GroupPage, locale: string) {
  return page.slug && page.celebrityId ? `/${encodeURIComponent(page.slug)}?locale=${encodeURIComponent(locale)}` : `/pages/groups/${page.id}?locale=${encodeURIComponent(locale)}`;
}
export function groupApiQuery(input: { type?: string; search?: string; sort?: string; cursor?: string; mine?: string; owned?: string; artistRole?: string; limit?: string }) {
  const query = new URLSearchParams({ limit: "8" });
  for (const [key, value] of Object.entries(input)) if (value) query.set(key, value);
  return `/api/groups?${query}`;
}
export const groupPostsSchema = z.object({ items:z.array(z.object({id:z.string().uuid(),pageId:z.string().uuid(),title:z.string(),body:z.string(),visibility:z.enum(["public","members"]),anonymous:z.boolean(),profileId:z.string().nullable(),nickname:z.string(),avatarUrl:z.string().nullable(),createdAt:z.string()})),nextCursor:z.string().nullable() });
export const groupMembersSchema = z.object({items:z.array(z.object({profileId:z.string().uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),role:z.enum(["owner","manager","member"]),answer:z.string().nullable().optional(),tier:z.string().nullable().optional(),joinedAt:z.string().nullable().optional(),lastActiveAt:z.string().nullable().optional(),postCount:z.number().int().nonnegative().nullable().optional(),commentCount:z.number().int().nonnegative().nullable().optional()})),nextCursor:z.string().nullable()});
export const groupRoomsSchema = z.object({canManage:z.boolean().optional(),items:z.array(z.object({id:z.string().uuid(),name:z.string(),defaultKey:z.enum(["artist","certified","free"]).nullable().optional(),minimumTier:z.string().nullable(),status:z.string(),canEnter:z.boolean(),opensAt:z.string().nullable().optional(),closesAt:z.string().nullable().optional(),latestMessage:z.string().nullable().optional(),unreadCount:z.number().int().nonnegative().nullable().optional()}))});
export const groupMessagesSchema = z.object({canSend:z.boolean().optional(),items:z.array(z.object({id:z.string().uuid(),body:z.string(),profileId:z.string().uuid(),nickname:z.string(),createdAt:z.string(),mine:z.boolean().optional(),avatarUrl:z.string().nullable().optional(),artist:z.boolean().optional()})),participants:z.array(z.object({profileId:z.string().uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),tier:z.string().nullable()})).optional()});

export function safeGroupReturnTo(value:unknown):string|undefined{if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return;try{const url=new URL(value,'https://kyaa.io');return url.origin==='https://kyaa.io'?`${url.pathname}${url.search}${url.hash}`:undefined;}catch{return;}}

export const groupOwnReportsSchema=z.object({items:z.array(z.object({id:z.uuid(),reason:z.string(),status:z.enum(["submitted","reviewing","action_requested","resolved"]),resolution:z.string().nullable(),createdAt:z.string(),targetPath:z.string().regex(/^\/pages\/groups\/[0-9a-f-]+\?tab=(board&post=|rooms&room=)[0-9a-f-]+$/).nullable()})),nextCursor:z.uuid().nullable()});
