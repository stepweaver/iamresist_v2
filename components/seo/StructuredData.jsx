function toGraphPayload(items) {
  if (items.length === 1) return items[0];

  return {
    '@context': 'https://schema.org',
    '@graph': items.map((item) => {
      const { '@context': _context, ...rest } = item;
      return rest;
    }),
  };
}

export default function StructuredData({ data }) {
  const items = (Array.isArray(data) ? data : [data]).filter(Boolean);
  if (items.length === 0) return null;

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(toGraphPayload(items)) }}
    />
  );
}
