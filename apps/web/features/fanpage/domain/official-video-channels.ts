/** Verified official channels shown in the "official videos" block. `videoId` pins a single video. */
export const OFFICIAL_VIDEO_CHANNELS: Readonly<Record<string, { name: string; id: string; videoId?: string }>> = {
  nchive: { name: "NCHIVE", id: "UCO-svEJBdWiaViuy0TxVFFg" },
  wena: { name: "We;Na", id: "UCpiXCVf9CaYppJQDDyiD6nA", videoId: "172bEkNPqqs" },
};

export function officialVideoChannel(slug: string) {
  return Object.hasOwn(OFFICIAL_VIDEO_CHANNELS, slug) ? OFFICIAL_VIDEO_CHANNELS[slug] : undefined;
}

export const officialVideoChannelUrl = (id: string) => `https://www.youtube.com/channel/${id}`;
