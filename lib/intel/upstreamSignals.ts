import type { MissionTag, NormalizedItem, SignalSourceConfig } from '@/lib/intel/types';

export type UpstreamSignalExplain = {
  ruleId: string;
  message: string;
  meta?: Record<string, unknown>;
};

function asPlainString(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const s = x.trim();
  return s ? s : null;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function normalizeUpstreamCategories(raw: unknown): { raw: string[]; normalized: string[] } {
  const rawList: string[] = [];

  // rss-parser commonly returns `string[]`, but we accept anything.
  if (Array.isArray(raw)) {
    for (const v of raw) {
      const s = asPlainString(v);
      if (s) rawList.push(normalizeWhitespace(s));
    }
  } else {
    const s = asPlainString(raw);
    if (s) rawList.push(normalizeWhitespace(s));
  }

  const capped = rawList.slice(0, 16).map((s) => (s.length > 80 ? `${s.slice(0, 80)}…` : s));
  const normalized = capped.map((s) => s.toLowerCase());
  return { raw: capped, normalized };
}

function hasAny(haystack: string, patterns: RegExp[]): boolean {
  for (const re of patterns) {
    if (re.test(haystack)) return true;
  }
  return false;
}

// Controlled, conservative mappings. These are *hints* only.
const CATEGORY_PATTERNS: Array<{ hint: string; patterns: RegExp[]; missionTags: MissionTag[] }> = [
  {
    hint: 'ukraine',
    patterns: [/\bukraine\b/i, /\bkyiv\b/i, /\bzelensky\b/i, /\brussia[-\s]?ukraine\b/i, /\bkremlin\b/i],
    missionTags: ['international_relevant'],
  },
  {
    hint: 'iran',
    patterns: [/\biran\b/i, /\btehran\b/i, /\birgc\b/i, /\bhezbollah\b/i, /\bhouthi\b/i],
    missionTags: ['international_relevant'],
  },
  {
    hint: 'defense',
    patterns: [
      /\bdefen[cs]e\b/i,
      /\bpentagon\b/i,
      /\bdod\b/i,
      /\bcia\b/i,
      /\bmilitary\b/i,
      /\bmissile\b/i,
      /\bdrone\b/i,
    ],
    missionTags: ['international_relevant'],
  },
  {
    hint: 'white_house',
    patterns: [/\bwhite\s+house\b/i, /\bpresident\b/i, /\boval\s+office\b/i, /\bwest\s+wing\b/i],
    missionTags: ['executive_power'],
  },
  {
    hint: 'accountability',
    patterns: [/\boversight\b/i, /\binvestigat/i, /\bwhistleblower\b/i, /\bethics\b/i, /\binspector\s+general\b/i],
    missionTags: ['federal_agencies'],
  },
];

export function upstreamCategoryHints(input: {
  categories: { raw: string[]; normalized: string[] };
}): { matchedHints: string[]; contributedMissionTags: MissionTag[] } {
  const joined = input.categories.normalized.join('\n');
  const hints: string[] = [];
  const tags: MissionTag[] = [];
  for (const rule of CATEGORY_PATTERNS) {
    if (hasAny(joined, rule.patterns)) {
      hints.push(rule.hint);
      for (const t of rule.missionTags) tags.push(t);
    }
  }
  return { matchedHints: [...new Set(hints)], contributedMissionTags: [...new Set(tags)] };
}

export function sourcePositionBoost(input: {
  item: NormalizedItem;
  cfg: SignalSourceConfig;
}): { boost: number; explain: UpstreamSignalExplain | null } {
  const posRaw = (input.item.structured ?? {})['sourcePosition'];
  const pos = typeof posRaw === 'number' ? posRaw : parseInt(String(posRaw ?? ''), 10);
  if (!Number.isFinite(pos) || pos <= 0) return { boost: 0, explain: null };

  // Evidence hierarchy: no upstream boosts for commentary items (keeps creator/video from jumping evidence).
  if (input.item.stateChangeType === 'commentary_item') return { boost: 0, explain: null };

  // Claims posture: reduce weight; upstream prominence can be gamed in claim-y feeds.
  const trustMode = input.cfg.trustWarningMode;
  const trustFactor = trustMode === 'source_controlled_official_claims' ? 0.35 : 1.0;

  // Steep decay; capped. 1→3, 2→2, 3→2, 4→1, 5→1, 6+→0
  const rawBoost = Math.max(0, Math.round(3 - Math.log2(pos + 0.5)));
  const boost = Math.max(0, Math.min(3, Math.round(rawBoost * trustFactor)));
  if (boost <= 0) return { boost: 0, explain: null };

  return {
    boost,
    explain: {
      ruleId: 'upstream:source_position_boost',
      message: `Boost: source position ${pos} (modest; decays quickly).`,
      meta: { sourcePosition: pos, boost, trustFactor },
    },
  };
}

export function upstreamCategoriesContribution(input: {
  item: NormalizedItem;
  cfg: SignalSourceConfig;
  haystack: string;
}): {
  boost: number;
  missionTags: MissionTag[];
  explain: UpstreamSignalExplain | null;
} {
  const cats = normalizeUpstreamCategories((input.item.structured ?? {})['itemCategories']);
  if (cats.normalized.length === 0) {
    return { boost: 0, missionTags: [], explain: null };
  }

  // Evidence hierarchy: do not let publisher categories drive commentary items.
  if (input.item.stateChangeType === 'commentary_item') {
    return { boost: 0, missionTags: [], explain: null };
  }

  const hint = upstreamCategoryHints({ categories: cats });
  if (hint.matchedHints.length === 0) {
    return {
      boost: 0,
      missionTags: [],
      explain: {
        ruleId: 'upstream:category_present_no_mapping',
        message: `Note: upstream categories present (${cats.raw.length}), but none mapped to controlled hints.`,
        meta: { categories: cats.raw.slice(0, 8) },
      },
    };
  }

  // Safety: categories only boost when corroborated by minimal text match.
  const corroborates =
    hint.matchedHints.includes('ukraine')
      ? /\bukraine|kyiv|zelensky|russia\b/i.test(input.haystack)
      : hint.matchedHints.includes('iran')
        ? /\biran|tehran|irgc|houthi|hezbollah\b/i.test(input.haystack)
        : hint.matchedHints.includes('defense')
          ? /\bdefen[cs]e|pentagon|dod|missile|drone|military\b/i.test(input.haystack)
          : hint.matchedHints.includes('white_house')
            ? /\bwhite\s+house|president|oval\s+office\b/i.test(input.haystack)
            : hint.matchedHints.includes('accountability')
              ? /\boversight|investigat|inspector\s+general|ethics\b/i.test(input.haystack)
              : false;

  // Claims posture: reduce weight.
  const trustMode = input.cfg.trustWarningMode;
  const trustFactor = trustMode === 'source_controlled_official_claims' ? 0.35 : 1.0;

  const boost = corroborates ? Math.max(0, Math.min(2, Math.round(2 * trustFactor))) : 0;

  return {
    boost,
    missionTags: hint.contributedMissionTags,
    explain: {
      ruleId: 'upstream:category_hint',
      message: corroborates
        ? `Boost: upstream categories corroborated controlled hints (${hint.matchedHints.join(', ')}).`
        : `Hint: upstream categories matched controlled hints (${hint.matchedHints.join(', ')}), but did not corroborate text; no score boost.`,
      meta: {
        matchedHints: hint.matchedHints,
        contributedMissionTags: hint.contributedMissionTags,
        categories: cats.raw.slice(0, 12),
        corroborates,
        boost,
        trustFactor,
      },
    },
  };
}

