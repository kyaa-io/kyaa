import { z } from 'zod';
import { localSnapshotSchema, type LocalSnapshot } from './local';
export const sourceSchema = z.object({
  app_users: z.array(z.object({id:z.uuid(),created_at:z.iso.datetime({offset:true}),passportReceived:z.boolean().optional(),communityJoined:z.boolean().optional()})),
  fan_action_occurrences: z.array(z.object({app_user_id:z.uuid(),source_namespace:z.string(),canonical_source_key:z.string(),source_occurred_at:z.iso.datetime({offset:true})})),
  activityNamespaces: z.object({attendance:z.string().min(1),comment:z.string().min(1)}).refine(value=>value.attendance!==value.comment),
  policy: localSnapshotSchema.shape.policy,
  entries: localSnapshotSchema.shape.entries,
}).strict();
export function projectSources(raw: unknown): LocalSnapshot {
  const source = sourceSchema.parse(raw);
  return localSnapshotSchema.parse({
    users:source.app_users.map(user=>({id:user.id,createdAt:user.created_at,passportReceived:user.passportReceived,communityJoined:user.communityJoined})),
    actions:source.fan_action_occurrences.flatMap(row=> {
      const kind = row.source_namespace===source.activityNamespaces.attendance ? 'attendance' : row.source_namespace===source.activityNamespaces.comment ? 'comment' : null;
      return kind ? [{userId:row.app_user_id,kind,sourceId:`${row.source_namespace}:${row.canonical_source_key}`,occurredAt:row.source_occurred_at}] : [];
    }),
    policy:source.policy,entries:source.entries,
  });
}
