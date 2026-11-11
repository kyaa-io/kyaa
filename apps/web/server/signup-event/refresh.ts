import type { DataClient } from '../data/client';
import { localSignupEnabled, readLocalSnapshot } from './local';
import { ingestLocalSources } from './local-store';
import { recordLocalReferral } from './sharing';
/** Existing successful producers refresh only this member; all remote operations here are SELECT. */
export async function refreshLocalSignupEvent(database: Pick<DataClient, 'from'>, userId: string): Promise<void> {
  if (!localSignupEnabled()) return;
  try {
    const attendance = 'group_creator_attendance';
    const post = 'fan_posts';
    const current = await readLocalSnapshot();
    const user = await database.from('app_users').select('id,created_at').eq('id',userId).single();
    if (user.error) throw new Error('SIGNUP_EVENT_USER_UNAVAILABLE');
    const rows: unknown[]=[];
    for (const table of [attendance,post]) {
      for (let offset=0;;offset+=500) {
        let query=database.from(table).select('id,app_user_id,created_at').eq('app_user_id',userId)
          .gte('created_at','2026-11-10T15:00:00Z').lt('created_at','2026-11-24T15:00:00Z');
        if (table===post) query=query.is('deleted_at',null).is('hidden_at',null);
        const page=await query.order('id').range(offset,offset+499);
        if(page.error)throw new Error('SIGNUP_EVENT_ACTIVITY_UNAVAILABLE');
        rows.push(...page.data.map(row=>({app_user_id:row.app_user_id,source_namespace:table,canonical_source_key:row.id,source_occurred_at:row.created_at})));
        if(page.data.length<500)break;
      }
    }
    await ingestLocalSources({app_users:[user.data],fan_action_occurrences:rows,activityNamespaces:{attendance,post},shareRecords:[],draftWeights:current.draftWeights});
    const { cookies } = await import('next/headers');
    const referral = (await cookies()).get('kyaa-signup-referral')?.value;
    if (referral) await recordLocalReferral(referral, userId, user.data.created_at);
  } catch (error) {
    // The original operation already committed; a later login refresh retries this projection.
    console.error('SIGNUP_EVENT_LOCAL_REFRESH_FAILED', error instanceof Error ? error.message : 'unknown');
  }
}
