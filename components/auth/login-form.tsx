'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthDivider, SocialAuthButtons } from '@/components/auth/social-auth-buttons';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError, isStaffRole } from '@/lib/utils';

export function LoginForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        toast.error('Sign in failed', { description: humanizeError(error) });
        return;
      }

      /*
       * Staff (admin *or* operator) should land in the console rather than on the
       * storefront home page — but never override an explicit ?redirectTo=.
       */
      let destination = redirectTo;
      if (redirectTo === '/' && data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .maybeSingle();

        if (isStaffRole(profile?.role)) destination = '/admin';
      }

      toast.success('Welcome back!');
      router.push(destination);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SocialAuthButtons redirectTo={redirectTo} disabled={loading} />

      <AuthDivider />

      <div className="grid gap-1.5">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="pl-9"
            required
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="pr-10"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:bg-accent"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        <LogIn className="h-4 w-4" /> Sign in
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        No account yet?{' '}
        <Link
          href={`/register?redirectTo=${encodeURIComponent(redirectTo)}`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
