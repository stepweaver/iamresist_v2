import Link from 'next/link';

function RichTextSegment({ part, index, journal }) {
  let content = part.plain_text ?? '';
  const ann = part.annotations ?? {};
  if (part.href) {
    content = (
      <Link
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
        className={journal ? undefined : 'text-primary hover:underline'}
      >
        {content}
      </Link>
    );
  }
  if (ann.code) {
    content = journal ? (
      <code>{content}</code>
    ) : (
      <code className="bg-foreground/10 px-1 py-0.5 rounded text-sm">{content}</code>
    );
  }
  if (ann.italic) content = <em>{content}</em>;
  if (ann.bold) content = <strong>{content}</strong>;
  return <span key={index}>{content}</span>;
}

function RichText({ richText, journal = false }) {
  if (!richText?.length) return null;
  return richText.map((part, index) => (
    <RichTextSegment key={index} part={part} index={index} journal={journal} />
  ));
}

function plainCaption(richText) {
  if (!richText?.length) return '';
  return richText.map((part) => part?.plain_text || '').join('').trim();
}

function renderJournalList(type, items, start) {
  const List = type === 'numbered_list_item' ? 'ol' : 'ul';
  return (
    <List key={`${type}-${start}`}>
      {items.map((block, offset) => (
        <li key={start + offset}>
          <RichText richText={block[type]?.rich_text} journal />
        </li>
      ))}
    </List>
  );
}

function renderBlock(block, index, journal) {
  if (!block?.type) return null;

  if (block.type === 'paragraph' && block.paragraph?.rich_text) {
    const textParts = block.paragraph.rich_text;
    if (textParts.length === 0) {
      return journal ? (
        <div key={index} className="journal-prose__gap" aria-hidden="true" />
      ) : (
        <div key={index} className="h-4" aria-hidden="true" />
      );
    }
    return (
      <p
        key={index}
        className={
          journal
            ? undefined
            : 'prose-copy text-foreground/90 leading-relaxed text-base sm:text-lg mb-6 last:mb-0'
        }
      >
        <RichText richText={textParts} journal={journal} />
      </p>
    );
  }

  if (block.type === 'heading_1' && block.heading_1?.rich_text) {
    if (journal) {
      return (
        <h2 key={index} className="journal-prose__h1">
          <RichText richText={block.heading_1.rich_text} journal />
        </h2>
      );
    }
    return (
      <h2
        key={index}
        className="section-title text-2xl sm:text-3xl font-bold text-foreground mt-8 mb-4 tracking-wider"
      >
        <RichText richText={block.heading_1.rich_text} />
      </h2>
    );
  }
  if (block.type === 'heading_2' && block.heading_2?.rich_text) {
    if (journal) {
      return (
        <h2 key={index} className="journal-prose__h2">
          <RichText richText={block.heading_2.rich_text} journal />
        </h2>
      );
    }
    return (
      <h3
        key={index}
        className="section-title text-xl sm:text-2xl font-bold text-foreground mt-6 mb-3 tracking-wider"
      >
        <RichText richText={block.heading_2.rich_text} />
      </h3>
    );
  }
  if (block.type === 'heading_3' && block.heading_3?.rich_text) {
    if (journal) {
      return (
        <h3 key={index} className="journal-prose__h3">
          <RichText richText={block.heading_3.rich_text} journal />
        </h3>
      );
    }
    return (
      <h4
        key={index}
        className="section-title text-lg sm:text-xl font-bold text-foreground mt-4 mb-2"
      >
        <RichText richText={block.heading_3.rich_text} />
      </h4>
    );
  }

  if (block.type === 'bulleted_list_item' && block.bulleted_list_item?.rich_text) {
    return (
      <ul key={index} className={journal ? undefined : 'list-disc ml-6 my-2'}>
        <li className={journal ? undefined : 'prose-copy text-foreground/90 leading-relaxed'}>
          <RichText richText={block.bulleted_list_item.rich_text} journal={journal} />
        </li>
      </ul>
    );
  }
  if (block.type === 'numbered_list_item' && block.numbered_list_item?.rich_text) {
    return (
      <ol key={index} className={journal ? undefined : 'list-decimal ml-6 my-2'}>
        <li className={journal ? undefined : 'prose-copy text-foreground/90 leading-relaxed'}>
          <RichText richText={block.numbered_list_item.rich_text} journal={journal} />
        </li>
      </ol>
    );
  }

  if (block.type === 'quote' && block.quote?.rich_text) {
    return (
      <blockquote
        key={index}
        className={
          journal ? undefined : 'border-l-4 border-primary pl-4 py-2 my-4 italic text-foreground/80'
        }
      >
        <RichText richText={block.quote.rich_text} journal={journal} />
      </blockquote>
    );
  }

  if (block.type === 'code' && block.code?.rich_text) {
    const text = block.code.rich_text.map((part) => part.plain_text).join('');
    return (
      <pre
        key={index}
        className={
          journal
            ? undefined
            : 'bg-military-grey/30 p-4 rounded border border-border overflow-x-auto my-4'
        }
      >
        <code className={journal ? undefined : 'text-sm text-foreground/90'}>{text}</code>
      </pre>
    );
  }

  if (block.type === 'divider') {
    return <hr key={index} className={journal ? undefined : 'border-border my-8'} />;
  }

  if (block.type === 'callout' && block.callout?.rich_text?.length) {
    return (
      <div
        key={index}
        className={
          journal
            ? 'journal-prose__callout'
            : 'border border-border/80 bg-foreground/5 rounded px-4 py-3 my-4'
        }
      >
        <RichText richText={block.callout.rich_text} journal={journal} />
      </div>
    );
  }

  if (block.type === 'image' && block.image) {
    const src =
      block.image.type === 'external' ? block.image.external?.url : block.image.file?.url;
    if (!src) return null;
    const caption = plainCaption(block.image.caption);
    if (journal) {
      return (
        <figure key={index}>
          {/* eslint-disable-next-line @next/next/no-img-element -- Notion-hosted URLs are dynamic */}
          <img src={src} alt="" loading="lazy" />
          {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Notion-hosted URLs are dynamic
      <img
        key={index}
        src={src}
        alt={caption}
        className="max-w-full rounded border border-border my-6"
        loading="lazy"
      />
    );
  }

  return null;
}

export default function NotionBlocksBody({ blocks, variant = 'default' }) {
  if (!blocks?.length) return null;
  const journal = variant === 'journal';
  const content = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (
      journal &&
      (block?.type === 'bulleted_list_item' || block?.type === 'numbered_list_item')
    ) {
      const type = block.type;
      const items = [];
      const start = index;
      while (index < blocks.length && blocks[index]?.type === type) {
        items.push(blocks[index]);
        index += 1;
      }
      index -= 1;
      content.push(renderJournalList(type, items, start));
      continue;
    }
    const node = renderBlock(block, index, journal);
    if (node) content.push(node);
  }

  if (journal) return <div className="journal-prose">{content}</div>;

  return (
    <article className="relative">
      <div className="space-y-6">{content}</div>
    </article>
  );
}
