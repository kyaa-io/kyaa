import type {AppLocale} from '@/i18n/locales';
import {groupApiQuery} from '../domain/contracts';
export function groupReferralGroupsPath(cursor?:string){return groupApiQuery({mine:'joined',limit:'50',cursor});}
export function referralCode(value:unknown){return typeof value==='string'&&/^[a-z0-9-]{6,32}$/i.test(value)?value.toUpperCase():undefined;}
export function referralDestination(value:unknown){if(typeof value!=='string')return '/';try{const u=new URL(value,'https://kyaa.invalid');if(u.origin!=='https://kyaa.invalid'||!(/^\/[a-z0-9][a-z0-9-]*$/i.test(u.pathname)||/^\/pages\/groups\/[0-9a-f-]{36}$/i.test(u.pathname)||u.pathname==='/'))return '/';return u.pathname+u.search+u.hash;}catch{return '/';}}
export function groupReferralPath(locale:AppLocale,code?:string,destination='/'){const q=new URLSearchParams({locale});if(code){const valid=referralCode(code);if(!valid)throw new Error('INVALID_INVITATION_CODE');q.set('code',valid);q.set('destination',referralDestination(destination));}return `/my/invitations?${q}`;}
export function groupReferralLink(origin:string,locale:AppLocale,code:string,destination='/'){return new URL(groupReferralPath(locale,code,destination),origin).href;}
