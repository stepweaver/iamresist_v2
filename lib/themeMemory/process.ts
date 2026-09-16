import { createHash } from 'node:crypto';

import { slugify } from '@/lib/utils/slugify';
import {
  THEME_LABEL_PROMPT_VERSION,
  THEME_MAX_AI_LABELS_PER_RUN,
  THEME_MAX_AI_MEMBERSHIP_CHECKS_PER_RUN,
  THEME_MAX_AI_CANDIDATES_PER_ITEM,
  THEME_MEMBERSHIP_IS_NOT_CORROBORATION,
  THEME_MEMBERSHIP_PROMPT_VERSION,
  themeClassificationCacheVersion,
} from '@/lib/themeMemory/constants';
import { isDeterministicThemeMatch, isPlausibleThemeCandidate, rankThemeCandidates } from '@/lib/themeMemory/candidates';
import { shouldAcceptAIMembership } from '@/lib/themeMemory/ai/accept';
import { deterministicLabelFromFingerprint, fingerprintFromCandidate } from '@/lib/themeMemory/features';
import {
  compareCandidateToThemeCore,
  coreMembersForLabel,
  identityClassForAttachment,
} from '@/lib/themeMemory/identity';
import { resolveThemeLifecycle } from '@/lib/themeMemory/lifecycle';
import { computeThemeDailySignal, toThemeDailySignalRecord, utcDateString } from '@/lib/themeMemory/signals';
import { analysisIsCurrent, themeItemKey, type ThemeStore } from '@/lib/themeMemory/store';
import { emptyThemeAIFailureCategories, recordThemeAIFailure, type ThemeAIFailureCategory } from '@/lib/themeMemory/ai/failures';
import type { ThemeAIProvider } from '@/lib/themeMemory/ai/types';
import type { ThemeCandidateItem } from '@/lib/themeMemory/types';
import type {
  ThemeCandidateMatch,
  ThemeItemAnalysisRecord,
  ThemeLifecycle,
  ThemeMembershipRecord,
  ThemeRecord,
} from '@/lib/themeMemory/themeTypes';

export type ThemeProcessDiagnostics = {
  creatorItemsConsidered: number;
  creatorItemsSkippedUnchanged: number;
  newswireItemsConsidered: number;
  intelItemsConsidered: number;
  themesCreated: number;
  themesUpdated: number;
  deterministicMemberships: number;
  aiMembershipChecks: number;
  aiMembershipsAccepted: number;
  aiMembershipsRejected: number;
  aiFailures: number;
  aiFailureReasons: Record<string, number>;
  aiFailureCategories: Record<ThemeAIFailureCategory, number>;
  aiUnavailable: boolean;
  incompleteClassification: boolean;
  newswireMembersAttached: number;
  intelMembersAttached: number;
  primaryMembersAttached: number;
  specialistMembersAttached: number;
  labelsGenerated: number;
  dailySignalsWritten: number;
  themesByLifecycle: Record<ThemeLifecycle, number>;
};

export type ThemeProcessResult = {
  ok: boolean;
  overallStatus: 'success' | 'partial' | 'failed';
  finishedAt: string;
  window: { start: string | null; end: string | null };
  diagnostics: ThemeProcessDiagnostics;
};

function emptyLifecycleCounts(): Record<ThemeLifecycle, number> {
  return { new: 0, developing: 0, persistent: 0, cooling: 0, resurging: 0, dormant: 0 };
}

function nowIso(now?: Date | string): string {
  if (!now) return new Date().toISOString();
  return now instanceof Date ? now.toISOString() : new Date(now).toISOString();
}

function observedAt(item: ThemeCandidateItem, fallback: string): string {
  return item.publishedAt || item.fetchedAt || fallback;
}

function newId(): string {
  return crypto.randomUUID();
}

function memberFingerprint(members: ThemeMembershipRecord[]): string {
  const payload = members
    .map((row) => themeItemKey(row))
    .sort()
    .join('|');
  return createHash('sha256').update(payload).digest('hex');
}

export function emptyThemeProcessDiagnostics(): ThemeProcessDiagnostics {
  return {
    creatorItemsConsidered: 0,
    creatorItemsSkippedUnchanged: 0,
    newswireItemsConsidered: 0,
    intelItemsConsidered: 0,
    themesCreated: 0,
    themesUpdated: 0,
    deterministicMemberships: 0,
    aiMembershipChecks: 0,
    aiMembershipsAccepted: 0,
    aiMembershipsRejected: 0,
    aiFailures: 0,
    aiFailureReasons: {},
    aiFailureCategories: emptyThemeAIFailureCategories(),
    aiUnavailable: false,
    incompleteClassification: false,
    newswireMembersAttached: 0,
    intelMembersAttached: 0,
    primaryMembersAttached: 0,
    specialistMembersAttached: 0,
    labelsGenerated: 0,
    dailySignalsWritten: 0,
    themesByLifecycle: emptyLifecycleCounts(),
  };
}

function sortAscending(items: ThemeCandidateItem[], fallback: string): ThemeCandidateItem[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(observedAt(a, fallback));
    const tb = Date.parse(observedAt(b, fallback));
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

function matchesForItem(
  item: ThemeCandidateItem,
  themes: ThemeRecord[],
  membershipsByTheme: Map<string, ThemeMembershipRecord[]>,
  fallback: string,
): ThemeCandidateMatch[] {
  const itemFp = fingerprintFromCandidate(item);
  const scored = themes.map((theme) =>
    compareCandidateToThemeCore({
      item: itemFp,
      theme,
      memberships: membershipsByTheme.get(theme.id) || [],
      itemObservedAt: observedAt(item, fallback),
    }),
  );
  return rankThemeCandidates(scored.filter(isPlausibleThemeCandidate));
}

function membershipRow(input: {
  theme: ThemeRecord;
  item: ThemeCandidateItem;
  method: ThemeMembershipRecord['membership_method'];
  confidence: number;
  reasons: string[];
  now: string;
  providerName?: string;
  providerModel?: string | null;
  classificationVersion: string;
  identityClass: 'core' | 'contextual';
  seeded?: boolean;
}): ThemeMembershipRecord {
  const observed = observedAt(input.item, input.now);
  return {
    id: newId(),
    theme_id: input.theme.id,
    source_system: input.item.sourceSystem,
    source_slug: input.item.sourceSlug,
    source_name: input.item.sourceName,
    identity_key: input.item.identityKey,
    canonical_url: input.item.canonicalUrl,
    title: input.item.title,
    summary: input.item.summary,
    published_at: input.item.publishedAt,
    item_observed_at: observed,
    member_role: input.item.role,
    membership_confidence: input.confidence,
    membership_method: input.method,
    membership_reasons: input.reasons,
    content_hash: input.item.contentHash,
    classification_version: input.classificationVersion,
    membership_prompt_version: input.method === 'ai' ? THEME_MEMBERSHIP_PROMPT_VERSION : null,
    provenance_class: input.item.provenanceClass ?? null,
    desk_lane: input.item.deskLane ?? null,
    source_family: input.item.sourceFamily ?? null,
    first_assigned_at: input.now,
    last_confirmed_at: input.now,
    metadata: {
      membershipIsNotCorroboration: THEME_MEMBERSHIP_IS_NOT_CORROBORATION,
      membershipMeans: 'topical_association_not_factual_corroboration',
      originalCandidateId: input.item.id,
      aiProvider: input.providerName ?? null,
      aiModel: input.providerModel ?? null,
      identityClass: input.identityClass,
      identityReason: input.identityClass === 'core' ? (input.seeded ? 'seed' : 'core_identity') : 'contextual',
    },
    created_at: input.now,
    updated_at: input.now,
  };
}

function analysisRow(input: {
  item: ThemeCandidateItem;
  decision: ThemeItemAnalysisRecord['decision'];
  themeId: string | null;
  method: ThemeMembershipRecord['membership_method'] | null;
  reasons: string[];
  now: string;
  classificationVersion: string;
}): ThemeItemAnalysisRecord {
  return {
    source_system: input.item.sourceSystem,
    source_slug: input.item.sourceSlug,
    identity_key: input.item.identityKey,
    content_hash: input.item.contentHash,
    classification_version: input.classificationVersion,
    theme_id: input.themeId,
    decision: input.decision,
    membership_method: input.method,
    reasons: input.reasons,
    created_at: input.now,
    updated_at: input.now,
  };
}

function seedThemeFromCreator(item: ThemeCandidateItem, now: string): ThemeRecord {
  const fingerprint = fingerprintFromCandidate(item);
  const label = deterministicLabelFromFingerprint(fingerprint, item.title);
  const id = newId();
  const slugBase = slugify(label) || 'theme';
  const observed = observedAt(item, now);
  return {
    id,
    slug: `${slugBase}-${id.slice(0, 8)}`,
    canonical_label: label,
    display_headline: `Coverage of ${label} continues`.slice(0, 140),
    summary: `Tracked creators began covering ${label}.`.slice(0, 400),
    first_seen_at: observed,
    last_seen_at: observed,
    lifecycle_status: 'new',
    metadata: {
      membershipIsNotCorroboration: THEME_MEMBERSHIP_IS_NOT_CORROBORATION,
      creatorSeedStrength: 'single',
      seededBy: item.sourceSlug,
      seededItemKey: `${item.sourceSystem}:${item.sourceSlug}:${item.identityKey}`,
      label: {
        provider: 'deterministic',
        model: null,
        promptVersion: THEME_LABEL_PROMPT_VERSION,
        generatedAt: now,
        memberFingerprint: '',
      },
    },
    created_at: now,
    updated_at: now,
  };
}

function touchTheme(theme: ThemeRecord, observed: string, now: string, extra: Record<string, unknown> = {}): ThemeRecord {
  const first = Date.parse(theme.first_seen_at) <= Date.parse(observed) ? theme.first_seen_at : observed;
  const last = Date.parse(theme.last_seen_at) >= Date.parse(observed) ? theme.last_seen_at : observed;
  return {
    ...theme,
    first_seen_at: first,
    last_seen_at: last,
    updated_at: now,
    metadata: { ...theme.metadata, ...extra },
  };
}

function creatorSeedStrength(members: ThemeMembershipRecord[]): 'single' | 'converged' {
  const creators = new Set(
    members.filter((row) => row.source_system === 'voice' && row.member_role === 'creator').map((row) => row.source_slug),
  );
  return creators.size >= 2 ? 'converged' : 'single';
}

export async function processThemeMemory(input: {
  items: ThemeCandidateItem[];
  store: ThemeStore;
  ai: ThemeAIProvider;
  now?: Date | string;
  refreshLabels?: boolean;
  windowStart?: Date | string | null;
  windowEnd?: Date | string | null;
  maxAiMembershipChecks?: number;
  maxAiLabels?: number;
}): Promise<ThemeProcessResult> {
  const finishedAt = nowIso(input.now);
  const diagnostics = emptyThemeProcessDiagnostics();
  const maxAiChecks = input.maxAiMembershipChecks ?? THEME_MAX_AI_MEMBERSHIP_CHECKS_PER_RUN;
  const maxAiLabels = input.maxAiLabels ?? THEME_MAX_AI_LABELS_PER_RUN;
  const classificationVersion = themeClassificationCacheVersion(input.ai.name);

  const themes = await input.store.listThemes();
  const memberships = await input.store.listMemberships();
  const themesById = new Map(themes.map((row) => [row.id, row]));
  const membershipsByTheme = new Map<string, ThemeMembershipRecord[]>();
  for (const row of memberships) {
    const list = membershipsByTheme.get(row.theme_id) || [];
    list.push(row);
    membershipsByTheme.set(row.theme_id, list);
  }

  const items = sortAscending(input.items, finishedAt);
  const creatorItems = items.filter((item) => item.sourceSystem === 'voice' && item.role === 'creator');
  const newswireItems = items.filter((item) => item.sourceSystem === 'newswire');
  const intelItems = items.filter((item) => item.sourceSystem === 'intel');

  diagnostics.creatorItemsConsidered = creatorItems.length;
  diagnostics.newswireItemsConsidered = newswireItems.length;
  diagnostics.intelItemsConsidered = intelItems.length;

  const attachToTheme = async (opts: {
    theme: ThemeRecord;
    item: ThemeCandidateItem;
    method: ThemeMembershipRecord['membership_method'];
    confidence: number;
    reasons: string[];
    decision: ThemeItemAnalysisRecord['decision'];
    match?: ThemeCandidateMatch | null;
    seeded?: boolean;
  }) => {
    const existing = await input.store.getMembershipByItem({
      source_system: opts.item.sourceSystem,
      source_slug: opts.item.sourceSlug,
      identity_key: opts.item.identityKey,
    });
    if (existing) return existing;

    const identityClass = identityClassForAttachment({
      item: opts.item,
      match: opts.match || null,
      seeded: Boolean(opts.seeded),
    });
    const row = membershipRow({
      theme: opts.theme,
      item: opts.item,
      method: opts.method,
      confidence: opts.confidence,
      reasons: [...opts.reasons, identityClass === 'core' ? 'identity_core' : 'identity_contextual'],
      now: finishedAt,
      providerName: opts.method === 'ai' ? input.ai.name : undefined,
      providerModel: opts.method === 'ai' ? input.ai.model : undefined,
      classificationVersion,
      identityClass,
      seeded: opts.seeded,
    });
    const saved = await input.store.upsertMembership(row);
    const list = membershipsByTheme.get(opts.theme.id) || [];
    list.push(saved);
    membershipsByTheme.set(opts.theme.id, list);

    const updated = touchTheme(opts.theme, row.item_observed_at, finishedAt, {
      creatorSeedStrength: creatorSeedStrength(list),
    });
    themesById.set(updated.id, updated);
    await input.store.upsertTheme(updated);
    diagnostics.themesUpdated += 1;

    if (opts.method === 'deterministic') diagnostics.deterministicMemberships += 1;
    if (opts.item.sourceSystem === 'newswire') diagnostics.newswireMembersAttached += 1;
    if (opts.item.sourceSystem === 'intel') diagnostics.intelMembersAttached += 1;
    if (opts.item.role === 'primary') diagnostics.primaryMembersAttached += 1;
    if (opts.item.role === 'specialist') diagnostics.specialistMembersAttached += 1;

    await input.store.upsertAnalysis(
      analysisRow({
        item: opts.item,
        decision: opts.decision,
        themeId: opts.theme.id,
        method: opts.method,
        reasons: opts.reasons,
        now: finishedAt,
        classificationVersion,
      }),
    );
    return saved;
  };

  const createThemeForCreator = async (item: ThemeCandidateItem, reasons: string[]) => {
    const theme = seedThemeFromCreator(item, finishedAt);
    await input.store.upsertTheme(theme);
    themesById.set(theme.id, theme);
    membershipsByTheme.set(theme.id, []);
    diagnostics.themesCreated += 1;
    await attachToTheme({
      theme,
      item,
      method: 'deterministic',
      confidence: 1,
      reasons: ['seeded_creator_led_theme', ...reasons],
      decision: 'seeded',
      seeded: true,
    });
    return theme;
  };

  const considerAiMembership = async (item: ThemeCandidateItem, candidates: ThemeCandidateMatch[]) => {
    const top = candidates.slice(0, THEME_MAX_AI_CANDIDATES_PER_ITEM);
    for (const candidate of top) {
      if (diagnostics.aiMembershipChecks >= maxAiChecks) {
        diagnostics.incompleteClassification = true;
        return null;
      }
      diagnostics.aiMembershipChecks += 1;
      try {
        const theme = themesById.get(candidate.theme.id) || candidate.theme;
        const coreMembers = coreMembersForLabel(theme, membershipsByTheme.get(candidate.theme.id) || []);
        const classifyInput = {
          itemTitle: item.title,
          itemSummary: item.summary,
          itemRole: item.role,
          itemSourceSystem: item.sourceSystem,
          itemSourceName: item.sourceName,
          themeLabel: candidate.theme.canonical_label,
          themeHeadline: candidate.theme.display_headline,
          themeMemberTitles: coreMembers.map((row) => row.title),
          themeCoreAnchors: [...candidate.sharedDistinctive, ...candidate.sharedPhrases, ...candidate.sharedClusterKeys],
          fingerprintOverlap: {
            sharedDistinctive: candidate.sharedDistinctive,
            sharedPhrases: candidate.sharedPhrases,
            reasons: candidate.reasons,
          },
          itemFingerprint: fingerprintFromCandidate(item),
        };
        const decision = await input.ai.classifyMembership(classifyInput);
        const accepted = shouldAcceptAIMembership({ decision, match: candidate, classifyInput });
        if (accepted.accept) {
          diagnostics.aiMembershipsAccepted += 1;
          return { candidate, decision };
        }
        diagnostics.aiMembershipsRejected += 1;
      } catch (error) {
        const classified = recordThemeAIFailure(diagnostics, error, '[theme-memory] AI membership check failed');
        if (classified.category === 'unavailable') {
          diagnostics.aiUnavailable = true;
        }
        diagnostics.incompleteClassification = true;
        return null;
      }
    }
    return null;
  };

  const processItem = async (item: ThemeCandidateItem, canSeed: boolean) => {
    const existingMembership = await input.store.getMembershipByItem({
      source_system: item.sourceSystem,
      source_slug: item.sourceSlug,
      identity_key: item.identityKey,
    });
    if (existingMembership) {
      if (existingMembership.content_hash === item.contentHash) {
        diagnostics.creatorItemsSkippedUnchanged += canSeed ? 1 : 0;
        return;
      }
      const updated: ThemeMembershipRecord = {
        ...existingMembership,
        title: item.title,
        summary: item.summary,
        content_hash: item.contentHash,
        last_confirmed_at: finishedAt,
        updated_at: finishedAt,
      };
      await input.store.upsertMembership(updated);
      return;
    }

    const existingAnalysis = await input.store.getAnalysis({
      source_system: item.sourceSystem,
      source_slug: item.sourceSlug,
      identity_key: item.identityKey,
    });
    if (existingAnalysis && analysisIsCurrent(existingAnalysis, item.contentHash, classificationVersion)) {
      if (canSeed) diagnostics.creatorItemsSkippedUnchanged += 1;
      return;
    }

    const candidates = matchesForItem(item, [...themesById.values()], membershipsByTheme, finishedAt);
    const deterministic = candidates.find(isDeterministicThemeMatch);
    if (deterministic) {
      const theme = themesById.get(deterministic.theme.id);
      if (theme) {
        await attachToTheme({
          theme,
          item,
          method: 'deterministic',
          confidence: Math.max(0.8, deterministic.score),
          reasons: deterministic.reasons,
          decision: 'attached',
          match: deterministic,
        });
        return;
      }
    }

    if (candidates.length > 0) {
      const aiHit = await considerAiMembership(item, candidates);
      if (aiHit) {
        const theme = themesById.get(aiHit.candidate.theme.id);
        if (theme) {
          await attachToTheme({
            theme,
            item,
            method: 'ai',
            confidence: aiHit.decision.confidence,
            reasons: [...aiHit.candidate.reasons, ...aiHit.decision.reasons],
            decision: 'attached',
            match: aiHit.candidate,
          });
          return;
        }
      }
      if (diagnostics.aiUnavailable || diagnostics.incompleteClassification) {
        if (canSeed) {
          await createThemeForCreator(item, ['ai_unavailable_or_incomplete_seeded_instead_of_merge']);
          return;
        }
        await input.store.upsertAnalysis(
          analysisRow({
            item,
            decision: 'no_match',
            themeId: null,
            method: null,
            reasons: ['ambiguous_match_without_complete_ai'],
            now: finishedAt,
            classificationVersion,
          }),
        );
        return;
      }
    }

    if (canSeed) {
      await createThemeForCreator(item, candidates.length === 0 ? ['no_plausible_existing_theme'] : ['ai_rejected_existing_candidates']);
      return;
    }

    await input.store.upsertAnalysis(
      analysisRow({
        item,
        decision: 'no_match',
        themeId: null,
        method: null,
        reasons: candidates.length === 0 ? ['no_plausible_creator_led_theme'] : ['ai_rejected_existing_candidates'],
        now: finishedAt,
        classificationVersion,
      }),
    );
  };

  for (const item of creatorItems) {
    await processItem(item, true);
  }
  for (const item of newswireItems) {
    await processItem(item, false);
  }
  for (const item of intelItems) {
    await processItem(item, false);
  }

  const latestMemberships = await input.store.listMemberships();
  const byTheme = new Map<string, ThemeMembershipRecord[]>();
  for (const row of latestMemberships) {
    const list = byTheme.get(row.theme_id) || [];
    list.push(row);
    byTheme.set(row.theme_id, list);
  }

  const signalDate = utcDateString(finishedAt);
  for (const theme of themesById.values()) {
    const members = byTheme.get(theme.id) || [];
    const computed = computeThemeDailySignal({
      themeId: theme.id,
      signalDate,
      memberships: members,
      nowIso: finishedAt,
    });
    await input.store.upsertSignal(
      toThemeDailySignalRecord(computed, { created_at: finishedAt, updated_at: finishedAt }),
    );
    diagnostics.dailySignalsWritten += 1;

    const lifecycle = resolveThemeLifecycle({
      firstSeenAt: theme.first_seen_at,
      lastCreatorActivityAt: computed.lastCreatorActivityAt,
      now: finishedAt,
      activeDays7: computed.active_days_7,
      activeDays14: computed.active_days_14,
      creatorMomentum: computed.creator_momentum,
      todayCreatorItemCount: computed.creator_item_count,
      previousLifecycle: theme.lifecycle_status,
    });

    let next = { ...theme, lifecycle_status: lifecycle, updated_at: finishedAt };
    const labelMembers = coreMembersForLabel(theme, members);
    const fingerprint = memberFingerprint(labelMembers.length > 0 ? labelMembers : members);
    const labelMeta = (theme.metadata?.label && typeof theme.metadata.label === 'object'
      ? (theme.metadata.label as Record<string, unknown>)
      : null);
    const needsLabel =
      Boolean(input.refreshLabels) ||
      !theme.display_headline ||
      labelMeta?.promptVersion !== THEME_LABEL_PROMPT_VERSION ||
      labelMeta?.memberFingerprint !== fingerprint;

    if (needsLabel && diagnostics.labelsGenerated < maxAiLabels) {
      try {
        const labeled = await input.ai.generateThemeLabel({
          currentLabel: theme.canonical_label,
          memberTitles: (labelMembers.length > 0 ? labelMembers : members).map((row) => row.title),
          memberRoles: [...new Set((labelMembers.length > 0 ? labelMembers : members).map((row) => row.member_role))],
          creatorNames: [
            ...new Set(
              (labelMembers.length > 0 ? labelMembers : members)
                .filter((row) => row.source_system === 'voice')
                .map((row) => row.source_name),
            ),
          ],
        });
        next = {
          ...next,
          canonical_label: labeled.canonicalLabel,
          display_headline: labeled.headline,
          summary: labeled.summary,
          metadata: {
            ...next.metadata,
            label: {
              provider: input.ai.name,
              model: input.ai.model,
              promptVersion: THEME_LABEL_PROMPT_VERSION,
              generatedAt: finishedAt,
              memberFingerprint: fingerprint,
            },
          },
        };
        diagnostics.labelsGenerated += 1;
      } catch (error) {
        recordThemeAIFailure(diagnostics, error, '[theme-memory] AI label generation failed');
        diagnostics.incompleteClassification = true;
        next = {
          ...next,
          metadata: {
            ...next.metadata,
            label: {
              provider: 'deterministic',
              model: null,
              promptVersion: THEME_LABEL_PROMPT_VERSION,
              generatedAt: finishedAt,
              memberFingerprint: fingerprint,
            },
          },
        };
      }
    }

    await input.store.upsertTheme(next);
    themesById.set(next.id, next);
  }

  for (const theme of themesById.values()) {
    diagnostics.themesByLifecycle[theme.lifecycle_status] += 1;
  }

  const overallStatus =
    diagnostics.aiFailures > 0 || diagnostics.incompleteClassification ? 'partial' : 'success';

  return {
    ok: true,
    overallStatus,
    finishedAt,
    window: {
      start: input.windowStart ? nowIso(input.windowStart) : null,
      end: input.windowEnd ? nowIso(input.windowEnd) : null,
    },
    diagnostics,
  };
}
