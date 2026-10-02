import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { JEV_SHADOW_LOG_DIR } from '@/lib/jev/constants';
import type { ShadowDecisionRecord, ShadowRunMetadata } from '@/lib/jev/types';

export function shadowLogPath(evaluationRunId: string, directory = JEV_SHADOW_LOG_DIR): string {
  return join(process.cwd(), directory, `${evaluationRunId}.jsonl`);
}

export function writeShadowLabelFile(filePath: string, body: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, body, 'utf8');
}

export function appendShadowRecords(path: string, records: readonly ShadowDecisionRecord[]): void {
  mkdirSync(dirname(path), { recursive: true });
  if (!records.length) return;
  const body = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
  appendFileSync(path, body, 'utf8');
}

export function writeShadowEvaluationLog(
  path: string,
  metadata: ShadowRunMetadata,
  records: readonly ShadowDecisionRecord[],
): void {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [JSON.stringify(metadata), ...records.map((record) => JSON.stringify(record))];
  appendFileSync(path, `${lines.join('\n')}\n`, 'utf8');
}

function isRunMetadata(value: unknown): value is ShadowRunMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    row.recordType === 'run' &&
    typeof row.evaluationRunId === 'string' &&
    typeof row.requestedModel === 'string' &&
    typeof row.modelCatalogName === 'string' &&
    typeof row.modelCatalogReleaseDate === 'string' &&
    (row.modelCatalogDescription === null || typeof row.modelCatalogDescription === 'string') &&
    Array.isArray(row.returnedModels) &&
    Array.isArray(row.unexpectedReturnedModels)
  );
}

export function parseShadowRunMetadata(text: string): ShadowRunMetadata | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed: unknown = JSON.parse(trimmed);
    if (isRunMetadata(parsed)) return parsed;
  }
  return null;
}

export function parseShadowDecisionJsonl(text: string): ShadowDecisionRecord[] {
  const records: ShadowDecisionRecord[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && (parsed as { recordType?: string }).recordType === 'run') continue;
    records.push(parsed as ShadowDecisionRecord);
  }
  return records;
}
