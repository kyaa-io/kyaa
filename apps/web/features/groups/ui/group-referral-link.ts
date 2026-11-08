import type {AppLocale} from '@/i18n/locales';
import {groupApiQuery} from '../domain/contracts';
export function groupReferralGroupsPath(cursor?:string){return groupApiQuery({mine:'joined',limit:'50',cursor});}
export function referralCode(value:unknown){return typeof value==='string'&&/^[a-z0-9-]{6,32}$/i.test(value)?value.toUpperCase():undefined;}
export function referralDestination(value:unknown){if(typeof value!=='string')return '/';try{const u=new URL(value,'https://kyaa.invalid');if(u.origin!=='https://kyaa.invalid'||!(/^\/[a-z0-9][a-z0-9-]*$/i.test(u.pathname)||/^\/pages\/groups\/[0-9a-f-]{36}$/i.test(u.pathname)||u.pathname==='/'))return '/';return u.pathname+u.search+u.hash;}catch{return '/';}}
export function groupReferralPath(locale:AppLocale,code?:string,destination='/'){const q=new URLSearchParams({locale});if(code){const valid=referralCode(code);if(!valid)throw new Error('INVALID_INVITATION_CODE');q.set('code',valid);q.set('destination',referralDestination(destination));}return `/my/invitations?${q}`;}
/** 261107-2 E3: kyaa.io/i/<7 letters>. The short address keeps only the page path; the landing adds the reader's locale. */
export const inviteShortSlugPattern=/^[a-hjkmnp-z2-9]{7}$/;
export function inviteShortDestination(target:string){const path=referralDestination(target).split(/[?#]/)[0]!;return /^\/$|^\/pages\/groups\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^\/[a-z0-9][a-z0-9-]{0,79}$/.test(path)?path:'/';}
export function groupInviteShortLink(origin:string,slug:string){if(!inviteShortSlugPattern.test(slug))throw new Error('INVALID_INVITATION_CODE');return new URL(`/i/${slug}`,origin).href;}
export function groupReferralLink(origin:string,locale:AppLocale,code:string,destination='/'){return new URL(groupReferralPath(locale,code,destination),origin).href;}
