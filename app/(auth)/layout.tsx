import Link from 'next/link';
import { ArrowLeft, ShieldCheck, ShoppingBag, Zap } from 'lucide-react';
import { SupportWidgets } from '@/components/layout/support-widgets';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* -------------------------------------------------- brand panel ------ */}
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 top-1/4 h-96 w-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-emerald-400/20 blur-3xl"
        />

        <Link href="/" className="relative flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
            <ShoppingBag className="h-4 w-4" />
          </span>
          <span className="text-lg font-bold">NexusCommerce</span>
        </Link>

        <div className="relative mt-auto max-w-md">
          <h2 className="text-3xl font-bold leading-tight">
            Shop with confidence. Track everything in real time.
          </h2>
          <ul className="mt-8 space-y-4 text-sm text-primary-foreground/80">
            {[
              { icon: Zap, text: 'Live stock counts that never oversell.' },
              { icon: ShieldCheck, text: 'Your data is protected by row-level security.' },
              {
                icon: ShoppingBag,
                text: 'Cancel a pending order and the stock is restored automatically.',
              },
            ].map((item) => (
              <li key={item.text} className="flex items-start gap-3">
                <item.icon className="mt-0.5 h-4 w-4 shrink-0" />
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-10 text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Nexus Commerce
        </p>
      </aside>

      {/* -------------------------------------------------- form panel ------- */}
      <main className="flex flex-col p-6 sm:p-10">
        <Link
          href="/"
          className="mb-10 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to store
        </Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">{children}</div>
      </main>

      <SupportWidgets />
    </div>
  );
}
