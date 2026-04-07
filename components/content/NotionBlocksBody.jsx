import Link from 'next/link';

function RichTextSegment({ part, index }) {
  let content = part.plain_text ?? '';
  const ann = part.annotations ?? {};
  if (part.href) {
    content = (
      <Link
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
      >
        {content}
      </Link>
    );
  }
  if (ann.code)
    content = (
      <code className="bg-foreground/10 px-1 py-0.5 rounded text-sm">{content}</code>
    );
  if (ann.italic) content = <em>{content}</em>;
  if (ann.bold) content = <strong>{content}</strong>;
  return <span key={index}>{content}</span>;
}

function RichText({ richText }) {
  if (!richText?.length) return null;
  return richText.map((part, i) => (
    <RichTextSegment key={i} part={part} index={i} />
  ));
}

export default function NotionBlocksBody({ blocks }) {
  if (!blocks?.length) return null;

  return (
    <article className="relative">
      <div className="space-y-6">
        {blocks.map((block, index) => {
          if (!block?.type) return null;

          if (block.type === 'paragraph' && block.paragraph?.rich_text) {
            const textParts = block.paragraph.rich_text;
            if (textParts.length === 0)
              return <div key={index} className="h-4" aria-hidden />;
            return (
              <p
                key={index}
                className="prose-copy text-foreground/90 leading-relaxed text-base sm:text-lg mb-6 last:mb-0"
              >
                <RichText richText={textParts} />
              </p>
            );
          }

          if (block.type === 'heading_1' && block.heading_1?.rich_text) {
            const text = block.heading_1.rich_text.map((t) => t.plain_text).join('');
            return (
              <h2
                key={index}
                className="section-title text-2xl sm:text-3xl font-bold text-foreground mt-8 mb-4 tracking-wider"
              >
                {text}
              </h2>
            );
          }
          if (block.type === 'heading_2' && block.heading_2?.rich_text) {
            const text = block.heading_2.rich_text.map((t) => t.plain_text).join('');
            return (
              <h3
                key={index}
                className="section-title text-xl sm:text-2xl font-bold text-foreground mt-6 mb-3 tracking-wider"
              >
                {text}
              </h3>
            );
          }
          if (block.type === 'heading_3' && block.heading_3?.rich_text) {
            const text = block.heading_3.rich_text.map((t) => t.plain_text).join('');
            return (
              <h4
                key={index}
                className="section-title text-lg sm:text-xl font-bold text-foreground mt-4 mb-2"
              >
                {text}
              </h4>
            );
          }

          if (block.type === 'bulleted_list_item' && block.bulleted_list_item?.rich_text) {
            const text = block.bulleted_list_item.rich_text
              .map((t) => t.plain_text)
              .join('');
            return (
              <ul key={index} className="list-disc ml-6 my-2">
                <li className="prose-copy text-foreground/90 leading-relaxed">{text}</li>
              </ul>
            );
          }
          if (block.type === 'numbered_list_item' && block.numbered_list_item?.rich_text) {
            const text = block.numbered_list_item.rich_text
              .map((t) => t.plain_text)
              .join('');
            return (
              <ol key={index} className="list-decimal ml-6 my-2">
                <li className="prose-copy text-foreground/90 leading-relaxed">{text}</li>
              </ol>
            );
          }

          if (block.type === 'quote' && block.quote?.rich_text) {
            const text = block.quote.rich_text.map((t) => t.plain_text).join('');
            return (
              <blockquote
                key={index}
                className="border-l-4 border-primary pl-4 py-2 my-4 italic text-foreground/80"
              >
                {text}
              </blockquote>
            );
          }

          if (block.type === 'code' && block.code?.rich_text) {
            const text = block.code.rich_text.map((t) => t.plain_text).join('');
            return (
              <pre
                key={index}
                className="bg-military-grey/30 p-4 rounded border border-border overflow-x-auto my-4"
              >
                <code className="text-sm text-foreground/90">{text}</code>
              </pre>
            );
          }

          if (block.type === 'divider') {
            return <hr key={index} className="border-border my-8" />;
          }

          if (block.type === 'callout' && block.callout?.rich_text?.length) {
            return (
              <div
                key={index}
                className="border border-border/80 bg-foreground/5 rounded px-4 py-3 my-4"
              >
                <RichText richText={block.callout.rich_text} />
              </div>
            );
          }

          if (block.type === 'image' && block.image) {
            const src =
              block.image.type === 'external'
                ? block.image.external?.url
                : block.image.file?.url;
            if (!src) return null;
            return (
              // eslint-disable-next-line @next/next/no-img-element -- Notion-hosted URLs are dynamic
              <img
                key={index}
                src={src}
                alt=""
                className="max-w-full rounded border border-border my-6"
                loading="lazy"
              />
            );
          }

          return null;
        })}
      </div>
    </article>
  );
}
