const axes = ["likes", "stamps", "votes", "followers", "reactions", "news"] as const;
type Axis = typeof axes[number];
export type CreatorMetrics = Record<Axis, number>;
type Creator = { slug: string; metrics: CreatorMetrics };

function mapAxes(read: (axis: Axis) => number): CreatorMetrics {
  return Object.fromEntries(axes.map(axis => [axis, read(axis)])) as CreatorMetrics;
}

/** Compare the complete eligible cohort before limiting the home list. */
export function rankCreatorHex(creators: readonly Creator[]) {
  const maxima = mapAxes(axis => creators.reduce((max, row) => {
    const value = row.metrics[axis];
    if (!Number.isFinite(value) || value < 0) throw new RangeError(axis);
    return Math.max(max, value);
  }, 0));

  return creators.map(({ slug, metrics }) => {
    const scores = mapAxes(axis => maxima[axis] ? 100 * (metrics[axis] / maxima[axis]) : 0);
    const inside = (scores.likes + scores.stamps + scores.votes) / 3;
    const outside = (scores.followers + scores.reactions + scores.news) / 3;
    return { slug, scores, score: inside * 0.6 + outside * 0.4 };
  }).sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug, "en"));
}
