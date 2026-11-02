'use client';
import {ParticipationAdmin} from './participation-controls';
import {GroupGiftApplications} from '@/features/groups/ui/group-gifts';
export function GroupGiftManager({locale}:{locale:'ko'|'en'}){return <ParticipationAdmin groupLayout locale={locale} title={locale==='ko'?'선물 등록 검토':'Gift applications'} description=''>{role=><GroupGiftApplications locale={locale} admin canReview={role!=='viewer'}/>}</ParticipationAdmin>;}
