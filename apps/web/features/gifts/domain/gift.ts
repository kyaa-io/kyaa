import { z } from "zod";
import { ownedRaffleResultSchema } from "../../benefit/domain/raffle-result";

/** A gift is a published raffle win. A result that was not a win never reaches this contract. */
export const giftSchema = z.object({
  rewardResultId: z.string().uuid(),
  unread: z.boolean(),
  updatedAt: z.string().datetime({ offset: true }),
  result: ownedRaffleResultSchema,
}).strict().refine((gift) => gift.result.state === "won", { message: "A gift is a win" });
export type Gift = z.infer<typeof giftSchema>;

export const giftListSchema = z.object({ gifts: z.array(giftSchema) }).strict();
export const giftDetailSchema = z.object({ gift: giftSchema }).strict();

/** `singleUnreadId` is set only when exactly one gift is unread, so the MY banner can open it directly. */
export const giftUnreadSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  singleUnreadId: z.string().uuid().nullable(),
}).strict();
export type GiftUnread = z.infer<typeof giftUnreadSchema>;

export const giftPath = (rewardResultId: string) => `/my/gifts/${rewardResultId}`;
