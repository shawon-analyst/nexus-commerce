'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MailCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthDivider, SocialAuthButtons } from '@/components/auth/social-auth-buttons';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { humanizeError } from '@/lib/utils';

export function RegisterForm({ redirectTo = '/' }: { redirectTo?: string }) {
  const router = useRouter();
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [awaitingConfirmation, setAwaitingConfirmation] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error('Password too short', { description: 'Use at least 8 characters.' });
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // `role` is intentionally NOT sent: roles can only be granted by an admin
          // from inside the database, which prevents privilege escalation.
          data: { full_name: fullName.trim(), phone: phone.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`,
        },
      });

      if (error) {
        toast.error('Could not create your account', { description: humanizeError(error) });
        return;
      }

      /*
       * Signing up should hand back a session immediately. If GoTrue still has
       * "Confirm email" switched on it can return the user without one — but the
       * `on_auth_user_auto_confirm` trigger marks the address confirmed at insert
       * time, so a password sign-in right here completes the flow without ever
       * asking the shopper to leave the site.
       */
      let signedIn = Boolean(data.session);

      if (!signedIn) {
        const { error: fallbackError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (fallbackError) {
          setAwaitingConfirmation(true);
          toast.success('Account created', {
            description: 'Sign in with the same email and password to continue.',
          });
          return;
        }
        signedIn = true;
      }

      toast.success('Account created — you are signed in!', {
        description: `Welcome, ${fullName.trim() || 'shopper'}.`,
      });
      router.push(redirectTo);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (awaitingConfirmation) {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/15">
          <MailCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Account created</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            We could not sign you in automatically. Use <strong>{email}</strong> and the password you
            just chose to sign in — no email confirmation is required.
          </p>
        </div>
        <Button asChild className="w-full">
          <Link href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}>Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <SocialAuthButtons redirectTo={redirectTo} disabled={loading} />

      <AuthDivider label="or sign up with email" />

      <div className="grid gap-1.5">
        <Label htmlFor="full-name">Full name</Label>
        <Input
          id="full-name"
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Jane Doe"
          autoComplete="name"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="reg-email">Email</Label>
        <Input
          id="reg-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="reg-phone">Phone (optional)</Label>
        <Input
          id="reg-phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="01712 345678"
          autoComplete="tel"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="reg-password">Password</Label>
        <Input
          id="reg-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <Button type="submit" size="lg" className="w-full" loading={loading}>
        <UserPlus className="h-4 w-4" /> Create account
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already registered?{' '}
        <Link
          href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}
          className="font-medium text-foreground underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
