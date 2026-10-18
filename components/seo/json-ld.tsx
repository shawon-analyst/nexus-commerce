/**
 * Renders schema.org JSON-LD.
 *
 * Two safety notes:
 *   - `<` is escaped to `\u003c` so a product title containing `</script>`
 *     cannot close the tag early (the classic JSON-LD injection).
 *   - Data always comes from our own builders, never from raw user input, but the
 *     escaping holds regardless.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const graph = Array.isArray(data) ? data : [data];
  const payload = { '@context': 'https://schema.org', '@graph': graph };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(payload).replace(/</g, '\\u003c') }}
    />
  );
}
