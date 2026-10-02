import { describe, expect, it } from 'vitest';

import { JEV_PINNED_MODEL } from '@/lib/jev/constants';
import { JevShadowError } from '@/lib/jev/errors';
import { parseShadowDecisionJsonl, parseShadowRunMetadata } from '@/lib/jev/log';
import {
  assertPinnedJevModel,
  assertPinnedModelListed,
  classifyReturnedJevModel,
  createTypeSafeJevProvider,
} from '@/lib/jev/provider';
import { pairQuestions } from '@/lib/jev/questions';
import { buildShadowRunMetadata } from '@/lib/jev/shadow';
import type { JevFetch, JevModelListing } from '@/lib/jev/types';

const LATEST_RELEASE = '2026-09-10T18:38:01.391457+00:00';
const LATEST_DESCRIPTION = "The latest iteration of TypeSafe's System One Model: Jev";

function listing(name: string, releaseDate: string | null = LATEST_RELEASE, description: string | null = null): JevModelListing {
  return { name, description, releaseDate };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

describe('TypeSafe Jev provider', () => {
  it('requests jev-latest and refuses jev-preview or a catalog that lacks the alias', () => {
    expect(JEV_PINNED_MODEL).toBe('jev-latest');
    expect(() => assertPinnedJevModel('jev-latest')).not.toThrow();
    expect(() => assertPinnedJevModel('jev-preview')).toThrow(/jev-preview/);
    expect(() => assertPinnedJevModel('jev-1.13.0')).toThrow(JevShadowError);
    expect(() => assertPinnedModelListed([listing('jev-preview')], JEV_PINNED_MODEL)).toThrow(/jev-preview/);
    expect(() => assertPinnedModelListed([listing(JEV_PINNED_MODEL)], JEV_PINNED_MODEL)).not.toThrow();
  });

  it('fails closed before any decision when jev-latest is missing', async () => {
    const calls: string[] = [];
    const fetchImpl: JevFetch = async (url, init) => {
      calls.push(`${init.method} ${new URL(url).pathname}`);
      return jsonResponse({
        models: [{ name: 'jev-preview', description: 'preview', release_date: '2026-09-10T18:39:06.057655+00:00' }],
      });
    };
    const provider = createTypeSafeJevProvider({ apiKey: 'secret-token', fetchImpl });
    await expect(provider.validateModel()).rejects.toThrow(/Refusing to fall back to jev-preview/);
    expect(calls).toEqual(['GET /v1/models']);
    await expect(
      provider.decide({ state: { note: { text: 'a', evidence: 'a' } }, questions: pairQuestions() }),
    ).rejects.toThrow(/not validated/);
  });

  it('sends jev-latest, stores the catalog release, and keeps the resolved model separate', async () => {
    const bodies: unknown[] = [];
    const fetchImpl: JevFetch = async (url, init) => {
      const path = new URL(url).pathname;
      const authorization = new Headers(init.headers).get('Authorization');
      expect(authorization).toBe('Bearer secret-token');
      if (path.endsWith('/models')) {
        return jsonResponse({
          models: [
            { name: 'jev-preview', description: 'preview', release_date: '2026-09-10T18:39:06.057655+00:00' },
            { name: JEV_PINNED_MODEL, description: LATEST_DESCRIPTION, release_date: LATEST_RELEASE },
          ],
        });
      }
      bodies.push(JSON.parse(String(init.body)));
      return jsonResponse(
        {
          model: 'jev-1.13.0',
          answers: {
            same_event: { type: 'noul', noul: 0.42 },
            event_identity: {
              type: 'choice',
              choice: 'uncertain',
              confidence: 0.5,
              probabilities: { same_event: 0.1, related_but_distinct: 0.1, unrelated: 0.1, uncertain: 0.7 },
            },
          },
          usage: { input_tokens: 20, output_tokens: 4 },
        },
        200,
        { 'x-typesafe-request-id': 'req-optional' },
      );
    };
    const provider = createTypeSafeJevProvider({ apiKey: 'secret-token', fetchImpl });
    const validation = await provider.validateModel();
    expect(validation).toMatchObject({
      requestedModel: 'jev-latest',
      modelCatalogName: 'jev-latest',
      modelCatalogReleaseDate: LATEST_RELEASE,
      modelCatalogDescription: LATEST_DESCRIPTION,
    });
    expect(validation.listedModels).toEqual(['jev-preview', 'jev-latest']);
    const result = await provider.decide({
      state: { note: { text: 'Estonia', evidence: 'Estonia' }, candidate: { text: 'Estonia', evidence: 'Estonia' } },
      questions: pairQuestions(),
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ model: 'jev-latest' });
    expect(JSON.stringify(bodies[0])).not.toContain('jev-preview');
    expect(result.requestedModel).toBe('jev-latest');
    expect(result.returnedModel).toBe('jev-1.13.0');
    expect(
      classifyReturnedJevModel({
        requestedModel: validation.requestedModel,
        modelCatalogName: validation.modelCatalogName,
        returnedModel: result.returnedModel,
      }),
    ).toBe('resolved_release');
    const metadata = buildShadowRunMetadata('run-1', validation, [
      { returnedModel: result.returnedModel },
      { returnedModel: 'jev-preview' },
    ]);
    expect(metadata.returnedModels).toEqual(['jev-1.13.0', 'jev-preview']);
    expect(metadata.unexpectedReturnedModels).toEqual(['jev-preview']);
    const jsonl = `${JSON.stringify(metadata)}\n${JSON.stringify({ decisionId: 'd1', returnedModel: 'jev-1.13.0' })}\n`;
    expect(parseShadowRunMetadata(jsonl)?.modelCatalogReleaseDate).toBe(LATEST_RELEASE);
    expect(parseShadowDecisionJsonl(jsonl)).toEqual([{ decisionId: 'd1', returnedModel: 'jev-1.13.0' }]);
    expect(result.vendorRequestId).toBe('req-optional');
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 4 });
    expect(result.answers.same_event).toMatchObject({ type: 'noul', noul: 0.42 });
  });

  it('refuses a catalog entry that omits release_date', async () => {
    const fetchImpl: JevFetch = async () =>
      jsonResponse({ models: [{ name: 'jev-latest', description: 'alias' }] });
    const provider = createTypeSafeJevProvider({ apiKey: 'secret-token', fetchImpl });
    await expect(provider.validateModel()).rejects.toThrow(/release_date/);
  });

  it('keeps a vendor request id optional and does not echo the API key', async () => {
    const fetchImpl: JevFetch = async (url) => {
      if (new URL(url).pathname.endsWith('/models')) {
        return jsonResponse({ error: 'unauthorized' }, 401);
      }
      return jsonResponse({}, 500);
    };
    const provider = createTypeSafeJevProvider({ apiKey: 'secret-token', fetchImpl });
    await expect(provider.validateModel()).rejects.toThrow(/HTTP 401/);
    try {
      await provider.validateModel();
      throw new Error('expected model validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(JevShadowError);
      expect(String(error)).not.toContain('secret-token');
    }
  });
});
