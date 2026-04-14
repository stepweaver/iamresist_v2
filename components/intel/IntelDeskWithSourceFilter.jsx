'use client';

import { useMemo } from 'react';
import LiveDeskView from '@/components/intel/LiveDeskView';
import IntelSourceFilter from '@/components/intel/IntelSourceFilter';
import { useFilteredDesk } from '@/components/intel/useFilteredDeskItems';

function hasAnyFilteredContent(desk) {
  const a = (k) => (Array.isArray(desk[k]) ? desk[k].length : 0);
  return (
    a('leadItems') +
      a('secondaryLeadItems') +
      a('items') +
      a('duplicateItems') +
      a('suppressedItems') +
      a('metadataOnlyItems') >
    0
  );
}

/**
 * Client wrapper: per-lane source filter + {@link LiveDeskView}.
 */
export default function IntelDeskWithSourceFilter({ desk, laneWarningSlot = null }) {
  const { filteredDesk, sourceSlug, setSourceSlug, sourceOptions } = useFilteredDesk(desk);

  const emptyAfterSourceFilter = useMemo(() => {
    if (!sourceSlug) return false;
    return !hasAnyFilteredContent(filteredDesk);
  }, [filteredDesk, sourceSlug]);

  return (
    <LiveDeskView
      desk={filteredDesk}
      emptyAfterSourceFilter={emptyAfterSourceFilter}
      laneWarningSlot={laneWarningSlot}
      sourceFilterSlot={
        <IntelSourceFilter
          options={sourceOptions}
          value={sourceSlug}
          onChange={setSourceSlug}
        />
      }
    />
  );
}
