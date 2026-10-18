import * as React from 'react';
import { CalendarClock } from 'lucide-react';
import { JsonLd } from '@/components/seo/json-ld';
import { LEGAL_LAST_UPDATED } from '@/lib/legal';
import { absoluteUrl } from '@/lib/seo';
import { breadcrumbSchema } from '@/lib/structured-data';

/**
 * Shared chrome for `/privacy` and `/terms`.
 *
 * These are the pages an OAuth provider (Meta in particular) reviews, so they
 * are deliberately plain: semantic headings, deep-linkable sections, no client
 * JavaScript, and nothing that can fail to render. They live inside the shop
 * route group, so they inherit the real header and footer — a reviewer must be
 * able to reach the policy from the storefront, and a shopper must be able to
 * get back to it.
 */

/**
 * A policy section. The `id` is a real anchor target, and `scroll-mt-32` keeps
 * the heading clear of the sticky header — without it `/privacy#data-deletion`
 * lands with the heading hidden behind the 64px bar.
 */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

/** A bulleted list with a little more breathing room than the defaults. */
export function LegalList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground/60">{children}</ul>;
}

/**
 * Page shell: breadcrumb structured data, an `<h1>`, the last-updated stamp and
 * the body. The `<JsonLd>` node is a breadcrumb only — a policy page has no
 * richer type, and claiming one would be misleading.
 */
export function LegalPage({
  title,
  summary,
  path,
  children,
}: {
  title: string;
  summary: string;
  path: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        data={[
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: title, path },
          ]),
        ]}
      />

      <article className="container-tight max-w-3xl py-14">
        <header className="border-b pb-6">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{summary}</p>
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" />
            Last updated {LEGAL_LAST_UPDATED}
          </p>
        </header>

        <div className="mt-8 space-y-8">{children}</div>

        <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
          <p>
            This document is published at{' '}
            <a href={absoluteUrl(path)} className="font-medium text-foreground underline underline-offset-2">
              {absoluteUrl(path)}
            </a>
            . Questions? Write to us — the contact details are in the storefront footer.
          </p>
        </footer>
      </article>
    </>
  );
}
