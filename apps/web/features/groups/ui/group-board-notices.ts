"use client";
import {z} from 'zod';
import type {AppLocale} from '@/i18n/locales';
import type {PinnedNotice} from '@/features/fan-posts/ui/compact-feed';
import {groupPostsSchema} from '../domain/contracts';
import {useGroupResource} from './use-group-resource';

/** The posts API accepts limit 1-100 (default 30); a board shows at most this many operator notices above the feed. */
export const BOARD_NOTICE_LIMIT=5;
const noticesSchema=groupPostsSchema.extend({items:z.array(groupPostsSchema.shape.items.element.extend({commentCount:z.number().int().nonnegative().optional()}))});
const parseNotices=(value:unknown)=>noticesSchema.parse(value);

/** Active operator notices of a group page (group_posts, category notice). `all` caps the list at BOARD_NOTICE_LIMIT; the notice filter omits the limit so the API default (30) applies.
 *  `items` is empty while loading, empty or failed; `pending` is true only while the first read is in flight (the request deadline of useGroupResource ends it). */
export function useGroupBoardNotices(pageId:string|undefined,locale:AppLocale,options:{all?:boolean;keepSource?:boolean}={}):{items:PinnedNotice[];pending:boolean}{
  const {all=true,keepSource=false}=options;
  const resource=useGroupResource(pageId?`/api/groups/${pageId}/posts?${new URLSearchParams({category:'notice',sort:'recent',...(all?{limit:String(BOARD_NOTICE_LIMIT)}:{})})}`:null,parseNotices);
  if(!pageId||resource.error||!resource.data)return {items:[],pending:Boolean(pageId)&&resource.loading};
  return {pending:false,items:resource.data.items.map(item=>({id:item.id,title:item.title,author:item.nickname,date:item.createdAt,commentCount:item.commentCount,href:`/pages/groups/${pageId}?${new URLSearchParams({locale,tab:'board',...(keepSource?{source:'official'}:{}),post:item.id})}`}))};
}