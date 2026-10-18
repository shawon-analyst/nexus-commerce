import * as React from 'react';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const tones = {
    default: 'bg-primary/10 text-primary',
    success: 'bg-emerald-50 text-emerald-600',
    warning: 'bg-amber-50 text-amber-600',
    danger: 'bg-rose-50 text-rose-600',
    info: 'bg-blue-50 text-blue-600',
  } as const;

  return (
    <div className={cn('rounded-xl border bg-card p-4 shadow-sm lg:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tones[tone])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums lg:text-3xl">{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
