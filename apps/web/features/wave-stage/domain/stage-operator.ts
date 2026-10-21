import { z } from 'zod';
import { waveMissionStampSchema } from '@/features/fanpage/domain/wave-missions';
const id = z.uuid();
export const stageOperatorCommandSchema = z.discriminatedUnion('operation', [
  z.object({ commandId: id, requestId: id, operation: z.literal('quiz-stamp'), participantId: id }).strict(),
  z.object({ commandId: id, requestId: id, operation: z.literal('bingo-stamp'), participantId: id }).strict(),
  z.object({ commandId: id, requestId: id, operation: z.literal('live-draw') }).strict(),
  z.object({ commandId: id, requestId: id, operation: z.literal('onsite-execute') }).strict(),
  z.object({ commandId: id, requestId: id, operation: z.literal('operator-refresh') }).strict(),
  z.object({ commandId: id, requestId: id, operation: z.literal('onsite-reveal'), drawId: id, prizeIndex: z.number().int().min(1).max(10) }).strict(),
]);
export type StageOperatorCommand = z.infer<typeof stageOperatorCommandSchema>;
export type StageOperatorResult = { status: 'confirmed' | 'rejected' | 'uncertain'; message?: string };
const stampSchema = waveMissionStampSchema;
export const stageOperatorStateSchema = z.object({
  ready: z.boolean(),
  participants: z.array(z.object({ id, name: z.string().max(200), quizCorrectAt: z.string().nullable(), bingoCompletedAt: z.string().nullable(), stamps: z.array(stampSchema).max(11) }).strict()).max(5000),
  onsite: z.object({ drawId: id.nullable(), entryCount: z.number().int().nonnegative(), revealedThrough: z.number().int().min(0).max(10) }).strict().nullable(),
}).strict();
export type StageOperatorState = z.infer<typeof stageOperatorStateSchema>;
