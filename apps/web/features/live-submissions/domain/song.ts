import { z } from "zod";
import { isRecordedReplayUrl } from "@/features/live/domain/live-watch-link";

export const songSelectionSchema = z.object({
  provider: z.enum(["spotify", "manual"]),
  trackId: z.string().nullable(),
  title: z.string().min(1).max(200),
  artist: z.string().min(1).max(200),
  album: z.string().max(200).nullable(),
  artworkUrl: z.string().nullable(),
  sourceUrl: z.string().max(2048).nullable(),
}).strict().superRefine((song, context) => {
  const valid = song.provider === "spotify"
    ? song.trackId !== null && /^[A-Za-z0-9]{22}$/.test(song.trackId)
      && song.sourceUrl === `https://open.spotify.com/track/${song.trackId}`
      && (song.artworkUrl === null || /^https:\/\/i\.scdn\.co\/image\/[a-fA-F0-9]+$/.test(song.artworkUrl))
    : song.trackId === null && song.album === null && song.artworkUrl === null
      && (song.sourceUrl === null || isRecordedReplayUrl("youtube", song.sourceUrl));
  if (!valid || !song.title.trim() || !song.artist.trim()) context.addIssue({ code: "custom", message: "Invalid song selection" });
});
export type SongSelection = z.infer<typeof songSelectionSchema>;
export const songSearchResponseSchema = z.object({ items: z.array(songSelectionSchema).max(10) }).strict();
