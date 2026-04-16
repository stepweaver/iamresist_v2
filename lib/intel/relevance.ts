import type {
  BranchOfGovernment,
  EditorialControls,
  InstitutionalArea,
  MissionTag,
  NormalizedItem,
  RelevanceExplanation,
  SignalSourceConfig,
  SourceFamily,
  StateChangeType,
  SurfaceState,
} from '@/lib/intel/types';
import { sourcePositionBoost, upstreamCategoriesContribution } from '@/lib/intel/upstreamSignals';

export type RelevanceProfile = {
  mission_tags: MissionTag[];
  branch_of_government: BranchOfGovernment;
  institutional_area: InstitutionalArea;
  relevance_score: number;
  surface_state: SurfaceState;
  suppression_reason: string | null;
  relevance_explanations: RelevanceExplanation[];
};

const SCORE_MIN = 0;
const SCORE_MAX = 100;

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(SCORE_MIN, Math.min(SCORE_MAX, Math.round(n)));
}

function uniqTags(tags: Iterable<MissionTag>): MissionTag[] {
  return [...new Set(tags)];
}

function normalizeHaystack(item: NormalizedItem): string {
  return `${item.title}\n${item.summary ?? ''}`.toLowerCase();
}

export function compilePatternList(patterns: string[] | undefined): RegExp[] {
  if (!patterns?.length) return [];
  const out: RegExp[] = [];
  for (const p of patterns) {
    const s = String(p).trim();
    if (!s) continue;
    try {
      out.push(new RegExp(s, 'i'));
    } catch {
      /* invalid regex from manifest — skip */
    }
  }
  return out;
}

function sourceBaseline(
  slug: string,
  provenanceClass: string,
  sourceFamily: SourceFamily,
): {
  tags: MissionTag[];
  branch: BranchOfGovernment;
  area: InstitutionalArea;
  defaultPriority: number;
} {
  if (sourceFamily === 'defense_primary' || sourceFamily === 'combatant_command') {
    return {
      tags: ['international_relevant', 'federal_agencies'],
      branch: 'executive',
      area: 'specialist',
      defaultPriority: 48,
    };
  }
  if (sourceFamily === 'defense_specialist') {
    return {
      tags: ['international_relevant'],
      branch: 'unknown',
      area: 'specialist',
      defaultPriority: 46,
    };
  }
  if (sourceFamily === 'watchdog_global') {
    return {
      tags: ['international_relevant', 'media_disinfo'],
      branch: 'unknown',
      area: 'specialist',
      defaultPriority: 44,
    };
  }
  if (sourceFamily === 'indicator_hard' || sourceFamily === 'indicator_soft') {
    return {
      tags: ['economy_major'],
      branch: 'administrative',
      area: 'federal_register',
      defaultPriority: 42,
    };
  }
  if (sourceFamily === 'indicator_anecdotal') {
    return {
      tags: ['international_relevant'],
      branch: 'unknown',
      area: 'unknown',
      defaultPriority: 28,
    };
  }
  if (sourceFamily === 'claims_public') {
    return {
      tags: ['media_disinfo'],
      branch: 'unknown',
      area: 'unknown',
      defaultPriority: 34,
    };
  }
  if (slug === 'wh-news' || slug === 'wh-presidential') {
    return {
      tags: ['executive_power'],
      branch: 'executive',
      area: 'white_house',
      defaultPriority: slug === 'wh-presidential' ? 62 : 52,
    };
  }
  if (slug === 'fr-public-inspection' || slug === 'fr-published') {
    return {
      tags: ['regulation', 'federal_agencies'],
      branch: 'administrative',
      area: 'federal_register',
      defaultPriority: 38,
    };
  }
  if (slug === 'govinfo-bills') {
    return {
      tags: ['congress'],
      branch: 'legislative',
      area: 'congress',
      defaultPriority: 44,
    };
  }
  if (slug === 'govinfo-crec') {
    return {
      tags: ['congress'],
      branch: 'legislative',
      area: 'congress',
      defaultPriority: 40,
    };
  }
  if (slug === 'reuters-wire' || slug === 'ap-wire') {
    return {
      tags: [],
      branch: 'unknown',
      area: 'wire',
      defaultPriority: provenanceClass === 'WIRE' ? 48 : 45,
    };
  }
  if (slug === 'scotusblog') {
    return {
      tags: ['courts'],
      branch: 'judicial',
      area: 'courts',
      defaultPriority: 55,
    };
  }
  if (slug === 'democracy-docket') {
    return {
      tags: ['courts', 'elections', 'voting_rights'],
      branch: 'judicial',
      area: 'courts',
      defaultPriority: 56,
    };
  }
  if (slug === 'lawfare') {
    return {
      tags: ['courts', 'federal_agencies', 'international_relevant'],
      branch: 'judicial',
      area: 'specialist',
      defaultPriority: 54,
    };
  }
  if (slug === 'propublica') {
    return {
      tags: ['federal_agencies', 'civil_liberties', 'elections'],
      branch: 'unknown',
      area: 'specialist',
      defaultPriority: 57,
    };
  }
  if (slug === 'american-oversight') {
    return {
      tags: ['federal_agencies', 'elections', 'voting_rights'],
      branch: 'administrative',
      area: 'specialist',
      defaultPriority: 55,
    };
  }
  if (slug === 'courier-the-cover-up') {
    return {
      tags: ['courts', 'civil_liberties'],
      branch: 'unknown',
      area: 'specialist',
      defaultPriority: 50,
    };
  }
  if (slug === 'robert-reich' || slug === 'on-offense-kris-goldsmith' || slug === 'total-hypocrisy') {
    return {
      tags: ['economy_major', 'elections', 'protest'],
      branch: 'unknown',
      area: 'unknown',
      defaultPriority: slug === 'on-offense-kris-goldsmith' ? 48 : 46,
    };
  }
  return {
    tags: [],
    branch: 'unknown',
    area: 'unknown',
    defaultPriority: 50,
  };
}

function frTypeTags(frType: string | null | undefined): MissionTag[] {
  if (!frType || typeof frType !== 'string') return [];
  const t = frType.toLowerCase();
  const out: MissionTag[] = [];
  if (t.includes('rule')) out.push('regulation');
  if (t.includes('presidential')) out.push('executive_power');
  if (t.includes('notice')) out.push('federal_agencies');
  return uniqTags(out);
}

/** Cross-cutting title/summary keywords → mission tags (deterministic). */
function keywordMissionTags(haystack: string): MissionTag[] {
  const tags: MissionTag[] = [];
  if (/\bexecutive\s+order\b/i.test(haystack) || /\be\.o\.\s*\d/i.test(haystack)) {
    tags.push('executive_power');
  }
  if (/\bproclamation\b/i.test(haystack)) tags.push('executive_power');
  if (/\bvoting\b|\ballot\b|\bredistrict/i.test(haystack)) tags.push('voting_rights');
  if (/\belection\b|\bFEC\b|\bcampaign\b/i.test(haystack)) tags.push('elections');
  if (/\bfirst\s+amendment\b|\bFourth\s+Amendment\b|\bcivil\s+rights\b/i.test(haystack)) {
    tags.push('civil_liberties');
  }
  if (/\bimmigration\b|\basylum\b|\bdeport/i.test(haystack)) tags.push('civil_liberties');
  if (/\bsec\b|\bSEC\b|\bfederal\s+reserve\b|\btariff\b/i.test(haystack)) tags.push('economy_major');
  if (/\bNATO\b|\bUkraine\b|\bUN\b|\btreaty\b/i.test(haystack)) tags.push('international_relevant');
  return uniqTags(tags);
}

function applyEditorialControls(
  item: NormalizedItem,
  haystack: string,
  controls: EditorialControls | undefined,
  explanations: RelevanceExplanation[],
): { score: number; surface: SurfaceState; suppressionReason: string | null } {
  let score = 0;
  let surface: SurfaceState = 'surfaced';
  let suppressionReason: string | null = null;

  const ec = controls;
  if (!ec) {
    return { score, surface, suppressionReason };
  }

  for (const kw of ec.blockKeywords ?? []) {
    const k = kw.trim().toLowerCase();
    if (!k) continue;
    if (haystack.includes(k)) {
      suppressionReason = `Suppressed: title or summary matched block keyword (“${kw.trim()}”).`;
      explanations.push({
        ruleId: 'editorial:block_keyword',
        message: suppressionReason,
      });
      return { score: 0, surface: 'suppressed', suppressionReason };
    }
  }

  for (const re of compilePatternList(ec.blockPatterns)) {
    const m = haystack.match(re) ?? item.title.match(re);
    if (m) {
      const snippet = m[0].length > 80 ? `${m[0].slice(0, 80)}…` : m[0];
      suppressionReason = `Suppressed: matched block pattern (${snippet}).`;
      explanations.push({
        ruleId: 'editorial:block_pattern',
        message: suppressionReason,
      });
      return { score: 0, surface: 'suppressed', suppressionReason };
    }
  }

  let boost = 0;
  for (const kw of ec.allowKeywords ?? []) {
    const k = kw.trim().toLowerCase();
    if (!k) continue;
    if (haystack.includes(k)) {
      boost += 4;
      explanations.push({
        ruleId: 'editorial:allow_keyword',
        message: `Boost: matched allow keyword (“${kw.trim()}”).`,
      });
    }
  }
  for (const re of compilePatternList(ec.allowPatterns)) {
    if (re.test(haystack) || re.test(item.title)) {
      boost += 5;
      explanations.push({
        ruleId: 'editorial:allow_pattern',
        message: 'Boost: matched allow pattern.',
      });
    }
  }
  score += Math.min(boost, 20);

  const pref = ec.preferredStateChangeTypes;
  if (pref && pref.length > 0 && !pref.includes(item.stateChangeType as StateChangeType)) {
    surface = 'downranked';
    explanations.push({
      ruleId: 'editorial:state_change_mismatch',
      message: `Downranked: state_change_type “${item.stateChangeType}” is not in this source’s preferred list (${pref.join(', ')}).`,
    });
    score -= 12;
  }

  return { score, surface, suppressionReason };
}

/**
 * Serialize manifest editorial controls for intel.sources.editorial_controls (JSON only).
 */
export function editorialControlsForDb(cfg: SignalSourceConfig): Record<string, unknown> {
  const ec = cfg.editorialControls;
  if (!ec) return {};
  const out: Record<string, unknown> = {};
  if (ec.defaultPriority != null) out.defaultPriority = ec.defaultPriority;
  if (ec.allowKeywords?.length) out.allowKeywords = ec.allowKeywords;
  if (ec.blockKeywords?.length) out.blockKeywords = ec.blockKeywords;
  if (ec.allowPatterns?.length) out.allowPatterns = ec.allowPatterns;
  if (ec.blockPatterns?.length) out.blockPatterns = ec.blockPatterns;
  if (ec.preferredStateChangeTypes?.length) out.preferredStateChangeTypes = ec.preferredStateChangeTypes;
  if (ec.noiseNotes) out.noiseNotes = ec.noiseNotes;
  if (ec.relevanceNotes) out.relevanceNotes = ec.relevanceNotes;
  return out;
}

export function computeRelevanceProfile(
  item: NormalizedItem,
  cfg: SignalSourceConfig,
): RelevanceProfile {
  const explanations: RelevanceExplanation[] = [];
  const haystack = normalizeHaystack(item);

  const baseline = sourceBaseline(cfg.slug, cfg.provenanceClass, cfg.sourceFamily);
  let tags = new Set<MissionTag>(baseline.tags);

  const frType =
    typeof item.structured?.fr_type === 'string' ? (item.structured.fr_type as string) : null;
  if (frType) {
    for (const t of frTypeTags(frType)) {
      tags.add(t);
    }
    explanations.push({
      ruleId: 'fr:fr_type',
      message: `Federal Register document type “${frType}” informed mission tags.`,
    });
  }

  for (const t of keywordMissionTags(haystack)) {
    tags.add(t);
  }

  explanations.push({
    ruleId: 'source:baseline',
    message: `Baseline from source “${cfg.slug}”: branch ${baseline.branch}, area ${baseline.area}.`,
  });

  let priority =
    cfg.editorialControls?.defaultPriority != null
      ? cfg.editorialControls.defaultPriority!
      : baseline.defaultPriority;
  explanations.push({
    ruleId: 'score:default_priority',
    message: `Default priority ${priority} (${cfg.editorialControls?.defaultPriority != null ? 'manifest' : 'catalog default'}).`,
  });

  const editorial = applyEditorialControls(item, haystack, cfg.editorialControls, explanations);

  if (editorial.surface === 'suppressed') {
    return {
      mission_tags: uniqTags(tags),
      branch_of_government: baseline.branch,
      institutional_area: baseline.area,
      relevance_score: 0,
      surface_state: 'suppressed',
      suppression_reason: editorial.suppressionReason,
      relevance_explanations: explanations,
    };
  }

  let score = priority + editorial.score;

  // Upstream metadata signals: supporting inputs only (never authoritative).
  const pos = sourcePositionBoost({ item, cfg });
  if (pos.explain) explanations.push(pos.explain);
  score += pos.boost;

  const cats = upstreamCategoriesContribution({ item, cfg, haystack });
  if (cats.explain) explanations.push(cats.explain);
  if (cats.missionTags.length) {
    for (const t of cats.missionTags) tags.add(t);
  }
  score += cats.boost;

  score = clampScore(score);

  const surface: SurfaceState = editorial.surface === 'downranked' ? 'downranked' : 'surfaced';

  return {
    mission_tags: uniqTags(tags),
    branch_of_government: baseline.branch,
    institutional_area: baseline.area,
    relevance_score: surface === 'downranked' ? clampScore(score - 5) : score,
    surface_state: surface,
    suppression_reason: null,
    relevance_explanations: explanations,
  };
}
