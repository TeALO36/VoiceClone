/**
 * Pure semantic-version helpers (no React Native / Expo imports) — unit-tested
 * by scripts/test-updates.js under plain Node.
 */

/**
 * Parses "v4.3.5" / "4.3.5" into [4, 3, 5]. Unknown or malformed input
 * becomes [0, 0, 0] so it never wins a comparison.
 */
export function parseVersion(raw: string | undefined | null): number[] {
  const cleaned = (raw ?? '').trim().replace(/^v/i, '');
  const parts = cleaned.split('.');
  if (parts.length < 2 || parts.some((p) => p === '' || Number.isNaN(Number(p)))) {
    return [0, 0, 0];
  }
  return parts.map((p) => Number(p));
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
