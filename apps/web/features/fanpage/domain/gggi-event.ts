import { z } from "zod";

export const gggiEventSchema = z.object({
  eventKey: z.literal("gggi-goods-2026"),
  status: z.enum(["draft", "open", "closed"]),
  participation: z.object({
    liked: z.boolean(),
    enteredAt: z.iso.datetime({ offset: true }).nullable(),
  }).strict().nullable(),
}).strict();
export type GggiEvent = z.infer<typeof gggiEventSchema>;
