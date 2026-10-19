import { z } from "zod";
import { celebritySlugSchema } from "@/features/fanpage/domain/community";
import { cheerFeedItemSchema, fanPostFeedItemSchema } from "./feed";

export const publicHomeFeedSchema = z.object({
  items: z.array(z.object({
    creatorSlug: celebritySlugSchema,
    creatorName: z.string().min(1),
    item: z.discriminatedUnion("kind", [
      fanPostFeedItemSchema.extend({ visibility: z.literal("public") }),
      cheerFeedItemSchema,
    ]),
  }).strict()).max(3),
}).strict();
export type PublicHomeFeed = z.infer<typeof publicHomeFeedSchema>;
