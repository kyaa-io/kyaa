import type { DataClient } from '../data/client';
import { inRaffleWindow } from '../../features/benefit/domain/signup-event';
import { localSignupEnabled, readLocalSnapshot } from './local';
import { ingestLocalSources } from './local-store';
/** Successful producers refresh only this member; all remote operations here are SELECT. */
export async function refreshLocalSignupEvent(database: Pick<DataClient, 'from'>, userId: string, enter = false): Promise<boolean> {
  if (!localSignupEnabled()) return false;
  try {
    const current = await readLocalSnapshot();
    const now = new Date().toISOString();
    if (enter && !inRaffleWindow(now,current.policy)) return false;
    const user = await database.from('app_users').select('id,created_at').eq('id',userId).single();
    if (user.error) throw new Error('RAFFLE_USER_UNAVAILABLE');
    const [passport,community] = await Promise.all([
      database.from('fan_passports').select('id').eq('app_user_id',userId).eq('business_status','issued').limit(1),
      database.from('group_memberships').select('page_id').eq('app_user_id',userId).limit(1),
    ]);
    if(passport.error || community.error) throw new Error('RAFFLE_PARTICIPATION_UNAVAILABLE');
    const rows: unknown[]=[];
    for (const table of ['group_creator_attendance','fan_post_comments','group_comments']) {
      for (let offset=0;;offset+=500) {
        const ownerColumn=table==='group_comments'?'author_id':'app_user_id';
        let query=database.from(table).select(`id,${ownerColumn},created_at`).eq(ownerColumn,userId)
          .gte('created_at',current.policy.startsAt).lte('created_at',current.policy.closesAt);
        if(table==='fan_post_comments')query=query.is('deleted_at',null).is('hidden_at',null);
        if(table==='group_comments')query=query.is('removed_at',null);
        const page=await query.order('id').range(offset,offset+499);
        if(page.error)throw new Error('RAFFLE_ACTIVITY_UNAVAILABLE');
        rows.push(...page.data.map(row=>({app_user_id:userId,source_namespace:table==='group_creator_attendance'?'attendance':'comment',canonical_source_key:`${table}:${row.id}`,source_occurred_at:row.created_at})));
        if(page.data.length<500)break;
      }
    }
    await ingestLocalSources({app_users:[{...user.data,passportReceived:passport.data.length>0,communityJoined:community.data.length>0}],fan_action_occurrences:rows,activityNamespaces:{attendance:'attendance',comment:'comment'},policy:current.policy,entries:enter?[{userId,enteredAt:now}]:[]}, true);
    return true;
  } catch (error) {
    console.error('RAFFLE_LOCAL_REFRESH_FAILED', error instanceof Error ? error.message : 'unknown');
    return false;
  }
}
