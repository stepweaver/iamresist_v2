import { isDeterministicThemeMatch, scoreThemeCandidate } from '@/lib/themeMemory/candidates';
import { buildThemeCoreFingerprint } from '@/lib/themeMemory/identity';
import type { ThemeMembershipRecord, ThemeRecord } from '@/lib/themeMemory/themeTypes';

export type LikelyDuplicateTheme = {
  leftId: string;
  rightId: string;
  leftLabel: string;
  rightLabel: string;
  score: number;
  deterministic: boolean;
  reasons: string[];
};

/**
 * Report-only. Does not merge themes or rewrite membership history.
 */
export function findLikelyDuplicateThemes(
  themes: ThemeRecord[],
  memberships: ThemeMembershipRecord[],
  opts: { limit?: number } = {},
): LikelyDuplicateTheme[] {
  const byTheme = new Map<string, ThemeMembershipRecord[]>();
  for (const row of memberships) {
    const list = byTheme.get(row.theme_id) || [];
    list.push(row);
    byTheme.set(row.theme_id, list);
  }

  const fingerprints = themes.map((theme) => ({
    theme,
    fingerprint: buildThemeCoreFingerprint(theme, byTheme.get(theme.id) || []),
  }));

  const out: LikelyDuplicateTheme[] = [];
  for (let i = 0; i < fingerprints.length; i += 1) {
    for (let j = i + 1; j < fingerprints.length; j += 1) {
      const left = fingerprints[i];
      const right = fingerprints[j];
      const match = scoreThemeCandidate({
        item: left.fingerprint,
        theme: right.fingerprint,
        themeRecord: right.theme,
        itemObservedAt: left.theme.last_seen_at,
      });
      if (!match.distinctiveAnchor) continue;
      const deterministic = isDeterministicThemeMatch(match);
      if (!deterministic && match.score < 0.55) continue;
      out.push({
        leftId: left.theme.id,
        rightId: right.theme.id,
        leftLabel: left.theme.canonical_label,
        rightLabel: right.theme.canonical_label,
        score: match.score,
        deterministic,
        reasons: match.reasons.slice(0, 6),
      });
    }
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, opts.limit ?? 40);
}
