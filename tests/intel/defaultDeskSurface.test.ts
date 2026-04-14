import { describe, expect, it } from 'vitest';
import { partitionDeskRowsForPipeline } from '@/lib/intel/defaultDeskSurface';

const row = (id: string, mode: string) =>
  ({
    id,
    content_use_mode: mode,
  }) as { id: string; content_use_mode: string };

describe('partitionDeskRowsForPipeline', () => {
  it('drops metadata_only for non-indicator lanes', () => {
    const { surfacedMain, downMain, metadataOnlyRows } = partitionDeskRowsForPipeline(
      'osint',
      [row('a', 'metadata_only'), row('b', 'feed_summary')],
      [row('c', 'metadata_only')],
    );
    expect(surfacedMain.map((r) => r.id)).toEqual(['b']);
    expect(downMain).toHaveLength(0);
    expect(metadataOnlyRows).toHaveLength(0);
  });

  it('splits metadata_only for indicators into metadataOnlyRows', () => {
    const { surfacedMain, downMain, metadataOnlyRows } = partitionDeskRowsForPipeline(
      'indicators',
      [row('a', 'metadata_only'), row('b', 'feed_summary')],
      [row('c', 'metadata_only')],
    );
    expect(surfacedMain.map((r) => r.id)).toEqual(['b']);
    expect(downMain).toHaveLength(0);
    expect(metadataOnlyRows.map((r) => r.id).sort()).toEqual(['a', 'c']);
  });
});
