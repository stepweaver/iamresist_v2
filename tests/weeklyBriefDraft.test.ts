import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const repoMocks = vi.hoisted(() => ({
  getWeeklyBriefWithBody: vi.fn(),
  updateWeeklyBrief: vi.fn(),
}));

const candidateMocks = vi.hoisted(() => ({
  getWeeklyBriefCandidates: vi.fn(),
}));

vi.mock('@/lib/notion/weeklyBriefs.repo', () => repoMocks);
vi.mock('@/lib/feeds/weeklyBriefCandidates.service', () => candidateMocks);
vi.mock('@/lib/env/openai', () => ({
  openaiEnv: {
    OPENAI_API_KEY: '',
    OPENROUTER_API_KEY: 'or-test',
    OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
    OPENROUTER_MODEL: 'google/gemma-3-27b-it:free',
    WEEKLY_BRIEF_DRAFT_MODEL: '',
  },
}));

describe('generateWeeklyBriefDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMocks.getWeeklyBriefWithBody.mockResolvedValue({
      id: 'brief-1',
      title: 'Weekly Brief // 2026-04-16',
      slug: 'weekly-brief-2026-04-16',
      weekOf: '2026-04-16',
      editorialThesis: 'The paper trail matters more than the spectacle.',
      bodyText: 'Messy notes and links.\n\nhttps://example.com/court',
      bodyUrls: ['https://example.com/court'],
      thoughtDump: 'This should not be used.',
    });
    candidateMocks.getWeeklyBriefCandidates.mockResolvedValue({
      window: {
        start: '2026-04-09T00:00:00.000Z',
        end: '2026-04-16T00:00:00.000Z',
        days: 7,
      },
      items: [
        {
          id: 'briefing:intel:intel-1',
          title: 'Court blocks policy',
          summary: 'Summary',
          canonicalUrl: 'https://example.com/court',
          publishedAt: '2026-04-15T12:00:00.000Z',
          lane: 'osint',
          sourceName: 'SCOTUSblog',
          sourceSlug: 'scotusblog',
          sourceSystem: 'homepage-briefing',
          explain: { scoringModel: 'homepageBriefingScore' },
        },
      ],
    });
    repoMocks.updateWeeklyBrief.mockImplementation(async (id, patch) => ({
      id,
      draft: patch.draft,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          id: 'resp_123',
          model: 'google/gemma-3-27b-it:free',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  subjectLine: 'Weekly Brief: The paper trail',
                  previewText: 'Courts, watchdogs, and the documents behind the week.',
                  briefTitle: 'The paper trail this week',
                  intro: 'This week came into focus through records and rulings.',
                  sections: [
                    {
                      heading: 'Courts',
                      body: 'A court ruling clarified the stakes.',
                      candidateIds: ['briefing:intel:intel-1'],
                    },
                  ],
                  closing: 'Follow the documents, not the spin.',
                }),
              },
            },
          ],
        }),
      }))
    );
  });

  it('uses selected candidate ids and writes the rendered draft back to Notion', async () => {
    const { generateWeeklyBriefDraft } = await import('@/lib/weeklyBrief/aiDraft.service');
    const payload = await generateWeeklyBriefDraft({
      briefId: 'brief-1',
      selectedCandidateIds: ['briefing:intel:intel-1'],
    });

    expect(payload.selectedCandidates).toHaveLength(1);
    expect(payload.selectedCandidates[0]?.selectedBy).toBe('explicit_id');
    expect(payload.validation.selectionMode).toBe('explicit_id');
    expect(payload.openai.provider).toBe('openrouter');
    expect(repoMocks.updateWeeklyBrief).toHaveBeenCalledWith(
      'brief-1',
      expect.objectContaining({
        draft: expect.stringContaining('Subject: Weekly Brief: The paper trail'),
      })
    );
  });

  it('falls back to body URLs when explicit selected ids are omitted', async () => {
    const { generateWeeklyBriefDraft } = await import('@/lib/weeklyBrief/aiDraft.service');
    const payload = await generateWeeklyBriefDraft({
      briefId: 'brief-1',
    });

    expect(payload.selectedCandidates).toHaveLength(1);
    expect(payload.selectedCandidates[0]?.selectedBy).toBe('body_url_match');
    expect(payload.validation.selectionMode).toBe('body_url_match');
  });

  it('does not fall back to body URL matches when explicit candidate ids are provided', async () => {
    const { generateWeeklyBriefDraft } = await import('@/lib/weeklyBrief/aiDraft.service');

    const payload = await generateWeeklyBriefDraft({
      briefId: 'brief-1',
      selectedCandidateIds: ['missing-id'],
    });

    expect(payload.selectedCandidates).toHaveLength(0);
    expect(payload.validation.selectionMode).toBe('explicit_id');
    expect(payload.validation.candidatesMatched).toBe(false);
    expect(payload.validation.selectionWarning).toContain('provided selectedCandidateIds');
  });

  it('fails clearly when page body text is empty even if thoughtDump exists on the row', async () => {
    repoMocks.getWeeklyBriefWithBody.mockResolvedValueOnce({
      id: 'brief-1',
      title: 'Weekly Brief // 2026-04-16',
      slug: 'weekly-brief-2026-04-16',
      weekOf: '2026-04-16',
      editorialThesis: 'The paper trail matters more than the spectacle.',
      bodyText: '   ',
      bodyUrls: [],
      thoughtDump: 'Fallback row thought dump',
    });

    const { generateWeeklyBriefDraft } = await import('@/lib/weeklyBrief/aiDraft.service');

    await expect(
      generateWeeklyBriefDraft({
        briefId: 'brief-1',
      })
    ).rejects.toThrow('Weekly Brief page body is empty. Add notes to the Notion page body before drafting.');
  });

  it('still drafts from the page body when no weekly candidates match body URLs', async () => {
    repoMocks.getWeeklyBriefWithBody.mockResolvedValueOnce({
      id: 'brief-1',
      title: 'Weekly Brief // 2026-04-16',
      slug: 'weekly-brief-2026-04-16',
      weekOf: '2026-04-16',
      editorialThesis: '',
      bodyText: 'Messy notes only.\n\nhttps://example.com/unmatched',
      bodyUrls: ['https://example.com/unmatched'],
      thoughtDump: 'This should not be used.',
    });

    const { generateWeeklyBriefDraft } = await import('@/lib/weeklyBrief/aiDraft.service');
    const payload = await generateWeeklyBriefDraft({
      briefId: 'brief-1',
    });

    expect(payload.selectedCandidates).toHaveLength(0);
    expect(payload.validation.selectionMode).toBe('body_url_match');
    expect(payload.validation.candidatesMatched).toBe(false);
    expect(payload.validation.selectionWarning).toContain('Notion page body URLs');
    expect(repoMocks.updateWeeklyBrief).toHaveBeenCalledWith(
      'brief-1',
      expect.objectContaining({
        draft: expect.stringContaining('Subject: Weekly Brief: The paper trail'),
      })
    );
  });
});
