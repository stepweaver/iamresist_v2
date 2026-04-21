import Link from 'next/link';
import StructuredData from '@/components/seo/StructuredData';
import { notFound } from 'next/navigation';
import { fetchSourceItemById } from '@/lib/intel/db';
import { buildIntelItemDetailModel } from '@/lib/intel/itemDetail';
import { intelItemPermalinkPath } from '@/lib/intel/permalinks';
import { buildPageMetadata } from '@/lib/metadata';
import { buildArticleSchema, buildBreadcrumbListSchema } from '@/lib/seo/schema';
import { joinSeoDescriptionParts, pickSeoDescription } from '@/lib/seo/text';
import { formatDate } from '@/lib/utils/date';
import { getIntelSourceLinkLabel } from '@/lib/sourceLinkLabels';

export const revalidate = 300;
export const dynamicParams = true;

function buildDescription(model) {
  const source = model?.sourceName ? `${model.sourceName}.` : null;
  return pickSeoDescription(
    [model?.summary, model?.whyItMatters, model?.trustExplain],
    joinSeoDescriptionParts(
      [
        model?.title ? `${model.title}.` : null,
        source,
        'Surfaced intel item from I AM [RESIST].',
      ],
      180,
    ),
    180,
  );
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const row = await fetchSourceItemById(id);
  const model = row ? buildIntelItemDetailModel(row) : null;
  if (!model) return buildPageMetadata({ title: 'Intel item', description: 'Intel item.', urlPath: '/intel/osint' });

  const urlPath = intelItemPermalinkPath(model.id);
  return buildPageMetadata({
    title: `${model.title} | Intel`,
    description: buildDescription(model),
    urlPath,
  });
}

function TrustCue({ model }) {
  if (!model?.trustExplain && !model?.trustWarningText && !model?.requiresIndependentVerification) return null;

  const cues = [];
  if (model.requiresIndependentVerification) {
    cues.push('Requires independent verification');
  }
  if (model.trustExplain) cues.push(model.trustExplain);

  return (
    <div className="mt-4 border border-border/60 bg-foreground/[0.02] p-4">
      <p className="font-mono text-[10px] uppercase tracking-wider text-foreground/60">Provenance / trust</p>
      {cues.length ? (
        <p className="mt-2 text-sm text-foreground/80 leading-relaxed">{cues.join(' · ')}</p>
      ) : null}
      {model.trustWarningText ? (
        <p className="mt-2 font-mono text-xs text-foreground/70 leading-relaxed">{model.trustWarningText}</p>
      ) : null}
    </div>
  );
}

export default async function IntelItemPage({ params }) {
  const { id } = await params;
  const row = await fetchSourceItemById(id);
  const model = row ? buildIntelItemDetailModel(row) : null;
  if (!model) notFound();

  const displayDate = model.publishedAt ? formatDate(model.publishedAt) : null;
  const urlPath = intelItemPermalinkPath(model.id);
  const description = buildDescription(model);
  const schema = [
    buildBreadcrumbListSchema([
      { name: 'Home', url: '/' },
      { name: 'Intel', url: '/intel/osint' },
      { name: model.title, url: urlPath },
    ]),
    buildArticleSchema({
      headline: model.title,
      description,
      url: urlPath,
      image: '/resist_sticker.png',
      datePublished: model.publishedAt || undefined,
      dateModified: model.fetchedAt || undefined,
    }),
  ];

  return (
    <main
      id="main-content"
      className="min-h-screen overflow-x-hidden"
      style={{
        backgroundImage:
          'linear-gradient(rgba(211, 47, 47, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(211, 47, 47, 0.03) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <StructuredData data={schema} />
      <div className="max-w-[900px] mx-auto px-4 sm:px-6 lg:px-10 py-10 sm:py-14">
        <nav className="nav-label mb-8 text-sm" aria-label="Breadcrumb">
          <Link href="/" className="text-foreground/60 hover:text-primary transition-colors font-bold">
            Home
          </Link>
          <span className="mx-2 text-foreground/40">/</span>
          <Link href="/intel/osint" className="text-foreground/60 hover:text-primary transition-colors font-bold">
            Intel
          </Link>
          <span className="mx-2 text-foreground/40">/</span>
          <span className="text-foreground font-bold truncate inline-block max-w-[70vw]" title={model.title}>
            {model.title}
          </span>
        </nav>

        <article className="machine-panel border border-border p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {model.provenanceClass ? (
              <span className="font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 border border-border rounded text-primary border-primary/40 bg-primary/5">
                {model.provenanceClass}
              </span>
            ) : null}
            {model.sourceName ? (
              <span className="font-mono text-[10px] text-hud-dim uppercase tracking-wider">{model.sourceName}</span>
            ) : null}
            {displayDate ? (
              <>
                <span className="text-hud-dim">|</span>
                <time className="font-mono text-[10px] text-hud-dim tracking-wider" dateTime={model.publishedAt || undefined}>
                  {displayDate}
                </time>
              </>
            ) : null}
          </div>

          <h1 className="section-title text-2xl sm:text-3xl font-bold text-foreground mt-4">
            {model.title}
          </h1>

          {model.whyItMatters ? (
            <div className="mt-5">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-primary">Why it matters</p>
              <p className="text-sm sm:text-base text-foreground/85 leading-relaxed border-l-2 border-primary/60 pl-3">
                {model.whyItMatters}
              </p>
            </div>
          ) : null}

          {model.summary && model.contentUseMode !== 'metadata_only' ? (
            <div className="mt-5">
              <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-foreground/60">Preview</p>
              <p className="text-sm text-foreground/80 leading-relaxed">{model.summary}</p>
            </div>
          ) : null}

          <TrustCue model={model} />

          <div className="mt-6 pt-5 border-t border-border/70 flex flex-wrap gap-3">
            <Link
              href={model.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="nav-label text-xs px-3 py-2 border border-primary text-primary hover:bg-primary hover:text-background transition-colors"
            >
              {getIntelSourceLinkLabel(
                { canonicalUrl: model.canonicalUrl, sourceSlug: model.sourceSlug, contentUseMode: model.contentUseMode },
                { withTrailingArrow: true },
              )}
            </Link>
            <Link
              href="/intel/osint"
              className="nav-label text-xs px-3 py-2 border border-border text-foreground/80 hover:border-primary hover:text-primary transition-colors"
            >
              Back to Intel
            </Link>
          </div>
        </article>
      </div>
    </main>
  );
}

