import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {z} from 'zod';
import {groupsEnabled} from '@/features/groups/domain/availability';
import {parseAppLocale} from '@/i18n/locales';
import {GroupMembershipInvitationScreen} from '@/features/groups/ui/group-membership-invitation';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'kyaa · Group invitation',referrer:'no-referrer',robots:{index:false,follow:false}};
export default async function Page({params,searchParams}:{params:Promise<{invitationId:string}>;searchParams:Promise<{locale?:string|string[]}>}){if(!groupsEnabled())notFound();const [{invitationId},query]=await Promise.all([params,searchParams]);if(!z.uuid().safeParse(invitationId).success)notFound();return <GroupMembershipInvitationScreen invitationId={invitationId} locale={parseAppLocale(query.locale)}/>;}
