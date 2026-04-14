import type { DeskLane } from '@/lib/intel/types';

export function isMetadataOnlyRow(row: { content_use_mode?: string | null }): boolean {
  return row.content_use_mode === 'metadata_only';
}

type RowWithMode = { content_use_mode?: string | null };

/**
 * Default intel desk surfaces: drop metadata-only everywhere except the indicators lane,
 * where it is split out for a non-card disclosure (not the main stack).
 */
export function partitionDeskRowsForPipeline<T extends RowWithMode>(
  lane: DeskLane,
  surfacedRows: T[],
  downRows: T[],
): {
  surfacedMain: T[];
  downMain: T[];
  metadataOnlyRows: T[];
} {
  if (lane === 'indicators') {
    const sm: T[] = [];
    const sMain: T[] = [];
    const dm: T[] = [];
    const dMain: T[] = [];
    for (const r of surfacedRows) {
      if (isMetadataOnlyRow(r)) sm.push(r);
      else sMain.push(r);
    }
    for (const r of downRows) {
      if (isMetadataOnlyRow(r)) dm.push(r);
      else dMain.push(r);
    }
    return { surfacedMain: sMain, downMain: dMain, metadataOnlyRows: [...sm, ...dm] };
  }
  const drop = (rows: T[]) => rows.filter((r) => !isMetadataOnlyRow(r));
  return { surfacedMain: drop(surfacedRows), downMain: drop(downRows), metadataOnlyRows: [] };
}
