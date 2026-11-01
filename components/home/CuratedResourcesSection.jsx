import CuratedResourceGroup from '@/components/resources/CuratedResourceGroup';
import { selectCuratedResources } from '@/lib/curated/resources';
import { getCuratedResourceDirectory } from '@/lib/curated/loadResources';

export default async function CuratedResourcesSection() {
  const resources = selectCuratedResources(await getCuratedResourceDirectory(), { limit: 3 });
  if (!resources.length) return null;

  return (
    <div className="px-1 pt-2 sm:px-2 lg:px-3">
      <div className="mx-auto max-w-[1600px]">
        <CuratedResourceGroup resources={resources} compact />
      </div>
    </div>
  );
}
