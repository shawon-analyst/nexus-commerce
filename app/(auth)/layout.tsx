import Link from 'next/link';
import { ArrowLeft, ShieldCheck, ShoppingBag, Zap } from 'lucide-react';
import { SupportWidgets } from '@/components/layout/support-widgets';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { LEGAL_LINKS } from '@/lib/legal';

/**
 * The auth shell: a frosted panel floating over a slowly drifting colour field.
 *
 * Everything painted behind the panel exists to give the panel's
 * `backdrop-filter` something worth blurring — a flat background would make the
 * glass invisible. All of it is `aria-hidden` decoration, and the canvas is
 * `overflow-hidden` so the oversized blurred orbs can never introduce a
 * horizontal scrollbar on a narrow phone.
 *
 * The unsigned-in storefront has no header, so the theme toggle lives here — the
 * glass tint is the one thing on the page that genuinely changes with the theme,
 * and a shopper should be able to see it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-canvas relative flex min-h-screen flex-col overflow-hidden">
      {/* ------------------------------------------------- colour field ------- */}
      <div aria-hidden className="auth-aurora pointer-events-none absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-32 h-[26rem] w-[26rem] rounded-full bg-indigo-400/40 blur-3xl dark:bg-indigo-600/30"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 top-1/4 h-[22rem] w-[22rem] rounded-full bg-sky-400/35 blur-3xl dark:bg-sky-500/25"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 left-1/4 h-[24rem] w-[24rem] rounded-full bg-emerald-300/35 blur-3xl dark:bg-emerald-500/20"
      />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      {/* ------------------------------------------------------- the card ----- */}
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-12 sm:py-16">
        <Link href="/" prefetch className="mb-8 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <ShoppingBag className="h-4 w-4" />
          </span>
          <span className="text-lg font-bold tracking-tight">NexusCommerce</span>
        </Link>

        <div className="w-full max-w-md">
          <div className="glass-panel p-6 sm:p-8">{children}</div>

          <ul className="mt-6 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
            {[
              { icon: Zap, text: 'Live stock, never oversold' },
              { icon: ShieldCheck, text: 'Row-level security' },
              { icon: ShoppingBag, text: 'Track every order' },
            ].map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-center gap-2 rounded-xl border border-black/5 bg-white/40 px-3 py-2 backdrop-blur dark:border-white/10 dark:bg-white/[0.05]"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {text}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex flex-col items-center gap-3 text-xs text-muted-foreground">
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    prefetch
                    className="transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/"
              prefetch
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to store
            </Link>
          </div>
        </div>
      </main>

      <SupportWidgets />
    </div>
  );
}
