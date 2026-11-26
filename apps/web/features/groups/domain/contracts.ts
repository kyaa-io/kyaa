import { z } from "zod";
import { externalRoomLinksRead } from "./external-room-link";

export const groupKindSchema = z.enum(["fan", "hobby", "brand"]);
export const groupPageSchema = z.object({
  id: z.string().uuid(), kind: groupKindSchema, celebrityId: z.string().uuid().nullable(),
  slug: z.string().nullable(), anonymous:z.boolean().optional(), name: z.string(), description: z.string(),
  imageUrl: z.string().nullable(), question: z.string().nullable(), memberCount: z.number().int().nonnegative(),
  // 팬페이지(kind=fan)에만: '좋아요 남기기'를 누른 활성 계정 수. 홈 크리에이터 랭킹의 누적 좋아요와 같은 값이다.
  likeCount: z.number().int().nonnegative().optional(),
  lastSeenAt: z.iso.datetime({offset:true}).nullable().optional(),
  isNew: z.boolean().optional(), challenge: z.boolean().optional(), fanCount: z.number().int().nonnegative().optional(),
  // Only with ?fields=facts (groupApiQuery({ fields: "facts" })). Absent on older servers and without the parameter.
  weeklyJoined: z.number().int().nonnegative().nullable().optional(),
  newPostCount: z.number().int().nonnegative().nullable().optional(),
  liveNow: z.boolean().nullable().optional(),
  lastActiveAt: z.iso.datetime({offset:true}).nullable().optional(),
  externalLinks: externalRoomLinksRead,
  // A fan page opened from a fan's request and not yet made official (no kyaa official mark). Set by the server, absent on official pages.
  unverified: z.literal(true).optional(),
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
export function groupApiQuery(input: { type?: string; search?: string; sort?: string; cursor?: string; mine?: string; owned?: string; artistRole?: string; limit?: string; fields?: "facts" }) {
  const query = new URLSearchParams({ limit: "8" });
  for (const [key, value] of Object.entries(input)) if (value) query.set(key, value);
  return `/api/groups?${query}`;
}
export const groupPostsSchema = z.object({ items:z.array(z.object({id:z.string().uuid(),pageId:z.string().uuid(),title:z.string(),body:z.string(),visibility:z.enum(["public","members"]),anonymous:z.boolean(),artist:z.boolean().optional(),operator:z.boolean().optional(),profileId:z.string().nullable(),nickname:z.string(),avatarUrl:z.string().nullable(),createdAt:z.string(),editedAt:z.string().nullable().optional()})),nextCursor:z.string().nullable() });
/** A group comment page. replyCount is on top-level comments only, and only with ?fields=replies. */
export const groupCommentsSchema = z.object({items:z.array(z.object({id:z.uuid(),parentId:z.uuid().nullable().optional(),body:z.string(),profileId:z.string().nullable(),nickname:z.string(),avatarUrl:z.string().nullable(),anonymous:z.boolean(),artist:z.boolean().optional(),operator:z.boolean().optional(),createdAt:z.string(),canDelete:z.boolean().optional(),assets:z.array(z.object({id:z.uuid(),kind:z.string(),width:z.number().nullable().optional(),height:z.number().nullable().optional()})).optional(),replyCount:z.number().int().nonnegative().optional()})),nextCursor:z.string().nullable()});
export const groupMembersSchema = z.object({items:z.array(z.object({profileId:z.string().uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),role:z.enum(["owner","manager","member"]),artist:z.boolean().optional(),tier:z.string().nullable().optional(),joinedAt:z.string().nullable().optional(),lastActiveAt:z.string().nullable().optional(),postCount:z.number().int().nonnegative().nullable().optional(),commentCount:z.number().int().nonnegative().nullable().optional()})),nextCursor:z.string().nullable()});
export const groupRoomsSchema = z.object({canManage:z.boolean().optional(),items:z.array(z.object({id:z.string().uuid(),name:z.string(),defaultKey:z.enum(["artist","certified","free","chat"]).nullable().optional(),minimumTier:z.string().nullable(),status:z.string(),canEnter:z.boolean(),reason:z.enum(["ok","stage_low","jjinfan_required","not_member"]).optional(),minimumStageKey:z.string().nullable().optional(),opensAt:z.string().nullable().optional(),closesAt:z.string().nullable().optional(),latestMessage:z.string().nullable().optional(),unreadCount:z.number().int().nonnegative().nullable().optional()}))}).transform(value=>({...value,items:value.items.filter(item=>item.defaultKey!=='chat')}));/* 팬페이지 채팅방은 비밀방 목록에 넣지 않는다. */
export const groupMessagesSchema = z.object({canSend:z.boolean().optional(),items:z.array(z.object({id:z.string().uuid(),body:z.string(),asset:z.object({id:z.uuid(),kind:z.literal("image"),width:z.number().positive(),height:z.number().positive()}).nullable().optional(),profileId:z.string().uuid(),nickname:z.string(),createdAt:z.string(),mine:z.boolean().optional(),avatarUrl:z.string().nullable().optional(),artist:z.boolean().optional()})),participants:z.array(z.object({profileId:z.string().uuid(),nickname:z.string(),avatarUrl:z.string().nullable(),tier:z.string().nullable()})).optional()});

/** 팬페이지 채팅방. 글(500자) 또는 사진·영상 1개를 보낸다. `artist`는 읽는 사람이 이 페이지의 확인된 크리에이터 본인인지. */
export const GROUP_CHAT_MAX_LENGTH = 500;
const groupChatItemSchema = groupMessagesSchema.shape.items.element.extend({
  asset: z.object({ id: z.uuid(), kind: z.enum(["image", "video"]), width: z.number().positive(), height: z.number().positive() }).nullable().optional(),
  // 글쓴이가 지금 이 팬페이지에 있는지(90초). 크리에이터는 접속 공개를 켠 경우만.
  online: z.boolean().optional(),
});
/** `firstUnreadId`: 내가 읽은 위치 뒤 첫 남의 메시지. `receipts`: 내 최근 메시지를 읽은 사람 수. `removed`: 방금 지워져 화면에서 뺄 메시지. */
export const groupChatSchema = z.object({
  canSend: z.boolean(), artist: z.boolean(), items: z.array(groupChatItemSchema),
  firstUnreadId: z.uuid().nullable().optional(),
  onlineCount: z.number().int().nonnegative().optional(),
  receipts: z.array(z.object({ id: z.uuid(), readCount: z.number().int().nonnegative() })).optional(),
  removed: z.array(z.uuid()).optional(),
});
export type GroupChat = z.infer<typeof groupChatSchema>;
export const groupChatUnreadSchema = z.object({ unreadCount: z.number().int().nonnegative() });
export const groupChatMessageInput = z.object({ body: z.string().trim().max(GROUP_CHAT_MAX_LENGTH).default(""), assetId: z.uuid().optional(), requestId: z.uuid() }).strict().refine((value) => Boolean(value.body || value.assetId));
/** 글 보내기 말고 채팅방에서 하는 일: 읽은 위치 올리기, 내 메시지 지우기, 남의 메시지 신고. */
export const groupChatActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read"), through: z.uuid() }).strict(),
  z.object({ action: z.literal("remove"), messageId: z.uuid() }).strict(),
  z.object({ action: z.literal("report"), messageId: z.uuid(), reason: z.string().trim().min(1).max(1000) }).strict(),
]);
export const onlineCreatorsSchema = z.array(z.string());

export function safeGroupReturnTo(value:unknown):string|undefined{if(typeof value!=='string'||!value.startsWith('/')||value.startsWith('//'))return;try{const url=new URL(value,'https://kyaa.io');return url.origin==='https://kyaa.io'?`${url.pathname}${url.search}${url.hash}`:undefined;}catch{return;}}

export const groupOwnReportsSchema=z.object({items:z.array(z.object({id:z.uuid(),reason:z.string(),status:z.enum(["submitted","reviewing","action_requested","resolved"]),resolution:z.string().nullable(),createdAt:z.string(),targetPath:z.string().regex(/^\/pages\/groups\/[0-9a-f-]+\?tab=(board&post=|rooms&room=)[0-9a-f-]+$/).nullable()})),nextCursor:z.uuid().nullable()});
