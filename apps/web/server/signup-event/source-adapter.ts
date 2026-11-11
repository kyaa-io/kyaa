import { z } from 'zod';
import { localSnapshotSchema, type LocalSnapshot } from './local';

/** Local projection of existing user, canonical activity and server attribution records. */
export const sourceSchema = z.object({
  app_users: z.array(z.object({id:z.uuid(),created_at:z.iso.datetime({offset:true})})),
  fan_action_occurrences: z.array(z.object({
    app_user_id:z.uuid(),source_namespace:z.string(),canonical_source_key:z.string(),source_occurred_at:z.iso.datetime({offset:true}),
  })),
  // Explicit namespace binding avoids accidentally rewarding likes/comments as posts.
  activityNamespaces: z.object({attendance:z.string().min(1),post:z.string().min(1)}).refine(value=>value.attendance!==value.post),
  shareRecords: z.array(z.object({ id:z.uuid(), owner_id:z.uuid(), occurred_at:z.iso.datetime({offset:true}), kind:z.enum(['share-click','referral-signup']), referred_user_id:z.uuid().optional(), verified:z.literal(true) })),
  draftWeights:localSnapshotSchema.shape.draftWeights,
}).strict();
export function projectSources(raw: unknown): LocalSnapshot {
  const source = sourceSchema.parse(raw);
  return localSnapshotSchema.parse({
    users:source.app_users.map(user=>({id:user.id,createdAt:user.created_at})),
    actions:[
      ...source.fan_action_occurrences.flatMap(row=> {
        const kind = row.source_namespace===source.activityNamespaces.attendance ? 'attendance' : row.source_namespace===source.activityNamespaces.post ? 'post' : null;
        return kind ? [{userId:row.app_user_id,kind,sourceId:`${row.source_namespace}:${row.canonical_source_key}`,occurredAt:row.source_occurred_at}] : [];
      }),
      ...source.shareRecords.map(row=>({userId:row.owner_id,kind:row.kind,sourceId:row.id,occurredAt:row.occurred_at,referredUserId:row.referred_user_id})),
    ],
    draftWeights:source.draftWeights,
  });
}
