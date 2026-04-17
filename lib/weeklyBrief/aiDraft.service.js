import 'server-only';

import { openaiEnv } from '@/lib/env/openai';
import { getWeeklyBriefCandidates } from '@/lib/feeds/weeklyBriefCandidates.service';
import { getWeeklyBriefWithBody, updateWeeklyBrief } from '@/lib/notion/weeklyBriefs.repo';

class WeeklyBriefDraftValidationError extends Error {
  constructor(message, details = {}, status = 400) {
    super(message);
    this.name = 'WeeklyBriefDraftValidationError';
    this.details = details;
    this.status = status;
  }
}

function normalizeSelectedIds(input) {
  const ids = Array.isArray(input) ? input : [];
  return Array.from(
    new Set(
      ids
        .map((id) => (id == null ? '' : String(id).trim()))
        .filter(Boolean)
    )
  );
}

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const parsed = new URL(url.trim());
    parsed.hash = '';
    return parsed.href.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function selectCandidates(payload, selectedCandidateIds, bodyUrls) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const explicit = new Set(normalizeSelectedIds(selectedCandidateIds));
  const bodyUrlSet = new Set((Array.isArray(bodyUrls) ? bodyUrls : []).map(normalizeUrl).filter(Boolean));

  const selected = [];
  const seen = new Set();
  const useExplicit = explicit.size > 0;

  for (const candidate of items) {
    const candidateUrl = normalizeUrl(candidate?.canonicalUrl || candidate?.url || '');
    const selectedById = explicit.has(String(candidate?.id ?? ''));
    const selectedByBodyUrl = !useExplicit && candidateUrl ? bodyUrlSet.has(candidateUrl) : false;
    if (!selectedById && !selectedByBodyUrl) continue;
    if (seen.has(candidate.id)) continue;
    seen.add(candidate.id);
    selected.push({
      ...candidate,
      selectedBy: selectedById ? 'explicit_id' : 'body_url_match',
    });
  }

  return {
    mode: useExplicit ? 'explicit_id' : 'body_url_match',
    items: selected,
    requestedExplicitIds: explicit.size,
    matchedCount: selected.length,
  };
}

function clipText(text, max = 12000) {
  const source = typeof text === 'string' ? text.trim() : '';
  if (source.length <= max) return source;
  return `${source.slice(0, max).trim()}\n\n[Truncated for draft input]`;
}

function briefDraftSchema() {
  return {
    name: 'weekly_brief_draft',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        subjectLine: { type: 'string' },
        previewText: { type: 'string' },
        briefTitle: { type: 'string' },
        intro: { type: 'string' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              heading: { type: 'string' },
              body: { type: 'string' },
              candidateIds: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['heading', 'body', 'candidateIds'],
          },
        },
        closing: { type: 'string' },
      },
      required: ['subjectLine', 'previewText', 'briefTitle', 'intro', 'sections', 'closing'],
    },
  };
}

function buildDraftPrompt({ brief, selectedCandidates, candidateWindow }) {
  const candidateInput = selectedCandidates.map((candidate) => ({
    id: candidate.id,
    title: candidate.title,
    summary: candidate.summary,
    url: candidate.canonicalUrl || candidate.url,
    publishedAt: candidate.publishedAt,
    lane: candidate.lane,
    sourceName: candidate.sourceName,
    sourceSlug: candidate.sourceSlug,
    sourceSystem: candidate.sourceSystem,
    explain: candidate.explain,
  }));

  return [
    {
      role: 'developer',
      content: [
        {
          type: 'input_text',
          text:
            'You are drafting a weekly editorial email for I AM [RESIST]. Use only the provided notes, URLs, and selected candidates. Do not invent events, quotes, or facts. Keep the writing sharp, clear, and publication-ready. Return JSON that matches the schema exactly.',
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: JSON.stringify(
            {
              brief: {
                id: brief.id,
                title: brief.title,
                slug: brief.slug,
                weekOf: brief.weekOf,
                editorialThesis: brief.editorialThesis || '',
                thoughtDump: clipText(brief.bodyText || ''),
                bodyUrls: brief.bodyUrls || [],
              },
              selectedCandidates: candidateInput,
              candidateWindow,
              instructions: {
                audience: 'subscribers receiving the [RESIST] Brief',
                goals: [
                  'Synthesize the week into a coherent editorial brief.',
                  'Use the thought dump as the primary framing source.',
                  'Work any selected candidates into the brief as supporting evidence and reading/listening pointers when they are relevant.',
                  'Do not mention internal tooling, selection metadata, or that this was AI-generated.',
                ],
              },
            },
            null,
            2
          ),
        },
      ],
    },
  ];
}

function extractResponseText(responseJson) {
  if (!responseJson || typeof responseJson !== 'object') return '';
  const output = Array.isArray(responseJson.output) ? responseJson.output : [];
  const chunks = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (part?.type === 'refusal' && part.refusal) {
        throw new Error(`OpenAI refused draft generation: ${part.refusal}`);
      }
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        chunks.push(part.text);
      }
    }
  }

  return chunks.join('\n').trim();
}

function buildChatMessages(prompt) {
  const messages = [];

  for (const item of Array.isArray(prompt) ? prompt : []) {
    const parts = Array.isArray(item?.content) ? item.content : [];
    const text = parts
      .filter((part) => part?.type === 'input_text' && typeof part.text === 'string')
      .map((part) => part.text.trim())
      .filter(Boolean)
      .join('\n\n');

    if (!text) continue;

    messages.push({
      role: item?.role === 'developer' ? 'system' : 'user',
      content: text,
    });
  }

  return messages;
}

function extractChatCompletionText(responseJson) {
  const content = responseJson?.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('\n')
      .trim();
  }

  return '';
}

function parseDraftResponse(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`AI draft response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function renderWeeklyBriefDraft(parsed) {
  const sections = Array.isArray(parsed?.sections) ? parsed.sections : [];
  const sectionText = sections
    .map((section) => {
      const refs = Array.isArray(section.candidateIds) && section.candidateIds.length
        ? `\nSources: ${section.candidateIds.join(', ')}`
        : '';
      return `## ${section.heading}\n\n${section.body}${refs}`;
    })
    .join('\n\n');

  return [
    `Subject: ${parsed?.subjectLine ?? ''}`,
    `Preview: ${parsed?.previewText ?? ''}`,
    '',
    `# ${parsed?.briefTitle ?? ''}`,
    '',
    parsed?.intro ?? '',
    '',
    sectionText,
    '',
    parsed?.closing ?? '',
  ]
    .join('\n')
    .trim();
}

async function requestWeeklyBriefDraft(prompt) {
  const openRouterKey = openaiEnv.OPENROUTER_API_KEY;
  if (openRouterKey) {
    const model = openaiEnv.OPENROUTER_MODEL || openaiEnv.WEEKLY_BRIEF_DRAFT_MODEL;
    if (!model) {
      throw new Error('OPENROUTER_MODEL or WEEKLY_BRIEF_DRAFT_MODEL is required when using OPENROUTER_API_KEY');
    }

    const baseUrl = (openaiEnv.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: buildChatMessages(prompt),
        response_format: {
          type: 'json_object',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${await response.text()}`);
    }

    const json = await response.json();
    const outputText = extractChatCompletionText(json);
    if (!outputText) {
      throw new Error('OpenRouter returned an empty draft response');
    }

    return {
      provider: 'openrouter',
      responseId: json.id ?? null,
      model: json.model ?? model,
      parsed: parseDraftResponse(outputText),
    };
  }

  const apiKey = openaiEnv.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('No AI provider is configured. Set OPENROUTER_API_KEY (preferred) or OPENAI_API_KEY.');
  }

  const model = openaiEnv.WEEKLY_BRIEF_DRAFT_MODEL || 'gpt-5-mini';
  if (!model) {
    throw new Error('WEEKLY_BRIEF_DRAFT_MODEL is required when using OPENAI_API_KEY');
  }

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: prompt,
      text: {
        format: {
          type: 'json_schema',
          ...briefDraftSchema(),
        },
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const outputText = extractResponseText(json);
  if (!outputText) {
    throw new Error('OpenAI returned an empty draft response');
  }

  return {
    provider: 'openai',
    responseId: json.id ?? null,
    model: json.model ?? model,
    parsed: parseDraftResponse(outputText),
  };
}

export async function generateWeeklyBriefDraft(options = {}) {
  const briefId = options?.briefId == null ? '' : String(options.briefId).trim();
  if (!briefId) {
    throw new WeeklyBriefDraftValidationError('briefId is required', {
      bodyTextPresent: false,
      selectionMode: 'none',
    });
  }

  const brief = await getWeeklyBriefWithBody(briefId);
  if (!brief) {
    throw new Error('Weekly Brief not found');
  }

  const bodyText = typeof brief.bodyText === 'string' ? brief.bodyText.trim() : '';
  if (!bodyText) {
    throw new WeeklyBriefDraftValidationError(
      'Weekly Brief page body is empty. Add notes to the Notion page body before drafting.',
      {
        bodyTextPresent: false,
        selectionMode: 'none',
      }
    );
  }

  const candidatePayload = await getWeeklyBriefCandidates({
    ...(options.windowStart ? { windowStart: options.windowStart } : {}),
    ...(options.windowEnd ? { windowEnd: options.windowEnd } : {}),
    ...(options.windowDays ? { windowDays: options.windowDays } : {}),
  });

  const selection = selectCandidates(
    candidatePayload,
    options.selectedCandidateIds,
    brief.bodyUrls
  );
  const selectedCandidates = selection.items;
  const selectionWarning =
    selectedCandidates.length > 0
      ? null
      : selection.mode === 'explicit_id'
        ? 'No weekly candidates matched the provided selectedCandidateIds. Draft generated from the Notion page body only.'
        : 'No weekly candidates matched the Notion page body URLs. Draft generated from the Notion page body only.';

  const prompt = buildDraftPrompt({
    brief: {
      ...brief,
      bodyText,
    },
    selectedCandidates,
    candidateWindow: candidatePayload.window,
  });

  const draftResponse = await requestWeeklyBriefDraft(prompt);
  const draftText = renderWeeklyBriefDraft(draftResponse.parsed);

  const updatedBrief = await updateWeeklyBrief(brief.id, {
    draft: draftText,
  });

  if (!updatedBrief) {
    throw new Error('Failed to write AI Draft back to Notion');
  }

  return {
    brief: {
      id: brief.id,
      title: brief.title,
      slug: brief.slug,
      weekOf: brief.weekOf,
    },
    bodyUrls: brief.bodyUrls,
    selectedCandidates,
    candidateWindow: candidatePayload.window,
    validation: {
      bodyTextPresent: true,
      selectionMode: selection.mode,
      candidatesMatched: selectedCandidates.length > 0,
      candidateCount: selectedCandidates.length,
      selectionWarning,
      persistedField: 'AI Draft',
    },
    draft: {
      structured: draftResponse.parsed,
      text: draftText,
    },
    openai: {
      provider: draftResponse.provider,
      responseId: draftResponse.responseId,
      model: draftResponse.model,
    },
  };
}

export { WeeklyBriefDraftValidationError };
