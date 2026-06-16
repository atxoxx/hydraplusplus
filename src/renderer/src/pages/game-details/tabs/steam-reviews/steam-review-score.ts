/**
 * Color hex used by the Steam review score descriptor. Mirrors the Steam
 * "small-caption" colors used across the storefront and ReviewViewer.
 */
export function getSteamScoreColor(descriptor: string | null): string {
  if (!descriptor) return "#d0d1d7";
  const desc = descriptor.toLowerCase();
  if (
    desc.includes("overwhelmingly positive") ||
    desc.includes("very positive") ||
    desc.includes("positive") ||
    desc.includes("mostly positive")
  ) {
    return "#66c0f4";
  }
  if (desc.includes("mixed")) return "#b9a074";
  if (
    desc.includes("mostly negative") ||
    desc.includes("negative") ||
    desc.includes("very negative") ||
    desc.includes("overwhelmingly negative")
  ) {
    return "#a34c25";
  }
  return "#d0d1d7";
}

/** Returns the positive ratio (0-100) for a SteamReviewSummary. */
export function getSteamPositiveRatio(summary: {
  totalPositive: number;
  totalReviews: number;
}): number {
  if (!summary || summary.totalReviews <= 0) return 0;
  return (summary.totalPositive / summary.totalReviews) * 100;
}
