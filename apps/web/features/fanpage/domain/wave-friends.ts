import { z } from "zod";
import { publicAvatarUrlSchema } from "@/features/profile/domain/avatar";

export const waveFriendSchema = z.object({ id: z.uuid(), profileId: z.uuid(), nickname: z.string().min(1), avatarUrl: publicAvatarUrlSchema, status: z.enum(["friends", "incoming", "outgoing"]) });
export type WaveFriend = z.infer<typeof waveFriendSchema>;
export const parseWaveFriends = (value: unknown) => z.object({ friendships: z.array(waveFriendSchema) }).parse(value);
export const waveMemberSchema = waveFriendSchema.pick({ profileId: true, nickname: true, avatarUrl: true });
export const parseWaveMembers = (value: unknown) => z.object({ members: z.array(waveMemberSchema).max(50), nextCursor: z.uuid().nullable() }).parse(value);
export const parseWaveProfile = (value: unknown) => z.object({ profile: z.object({ id: z.uuid(), nickname: z.string().min(1), avatarUrl: publicAvatarUrlSchema }), relationship: z.object({ friendshipId: z.uuid().nullable(), status: z.enum(["none", "friends", "incoming", "outgoing"]) }), isSelf: z.boolean() }).parse(value);
export const parseWaveLink = (value: unknown) => z.object({ token: z.uuid(), expiresAt: z.iso.datetime({ offset: true }) }).parse(value);

export function waveFriendToken(value: string, origin: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.pathname !== "/kyaa-wave-fanpage" || url.searchParams.get("tab") !== "friends" || url.searchParams.getAll("friend").length !== 1) return null;
    const token = z.uuid().safeParse(url.searchParams.get("friend"));
    return token.success ? token.data : null;
  } catch { return null; }
}
