'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isStaffRole } from '@/lib/utils';
import type { Profile } from '@/lib/types';

export type AuthUser = { id: string; email: string | null } | null;

type AuthContextValue = {
  user: AuthUser;
  profile: Profile | null;
  /** `role === 'admin'` — the only role that may manage users or change roles. */
  isAdmin: boolean;
  /**
   * `admin` *or* `operator`: the two roles that may open the admin console and
   * run orders, products and categories. Mirrors `is_staff()` in SQL, and is
   * what the *console links* key off — hiding them for an operator would strand
   * a legitimate staff member outside the panel the middleware would let them
   * into.
   */
  isStaff: boolean;
  isHydrated: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = React.createContext<AuthContextValue>({
  user: null,
  profile: null,
  isAdmin: false,
  isStaff: false,
  isHydrated: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({
  initialUser,
  initialProfile,
  children,
}: {
  initialUser: AuthUser;
  initialProfile: Profile | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = React.useState<AuthUser>(initialUser);
  const [profile, setProfile] = React.useState<Profile | null>(initialProfile);
  const [isHydrated, setHydrated] = React.useState(false);

  const refreshProfile = React.useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const {
      data: { user: current },
    } = await supabase.auth.getUser();
    if (!current) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', current.id)
      .maybeSingle();
    setProfile(data ?? null);
  }, []);

  React.useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    setHydrated(true);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
      setUser(nextUser);
      if (!nextUser) setProfile(null);
      else void refreshProfile();
      router.refresh();
    });

    return () => subscription.unsubscribe();
  }, [refreshProfile, router]);

  const signOut = React.useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    router.push('/');
    router.refresh();
  }, [router]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      isAdmin: profile?.role === 'admin',
      isStaff: isStaffRole(profile?.role),
      isHydrated,
      signOut,
      refreshProfile,
    }),
    [user, profile, isHydrated, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return React.useContext(AuthContext);
}
