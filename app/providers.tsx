'use client';

import { Toaster } from 'sonner';
import { AuthProvider, type AuthUser } from '@/components/providers/auth-provider';
import { CartHydrator } from '@/components/providers/cart-hydrator';
import { ThemeProvider } from '@/components/providers/theme-provider';
import { SiteSettingsProvider } from '@/components/providers/site-settings-provider';
import { CartSheet } from '@/components/storefront/cart-sheet';
import type { SiteSettings } from '@/lib/site-settings';
import type { Profile } from '@/lib/types';

export function Providers({
  initialUser,
  initialProfile,
  settings,
  children,
}: {
  initialUser: AuthUser;
  initialProfile: Profile | null;
  settings: SiteSettings;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <SiteSettingsProvider settings={settings}>
        <AuthProvider initialUser={initialUser} initialProfile={initialProfile}>
          <CartHydrator>
            {children}
            <CartSheet />
          </CartHydrator>
          <Toaster
            position="top-right"
            richColors
            closeButton
            theme="system"
            toastOptions={{ duration: 4000 }}
          />
        </AuthProvider>
      </SiteSettingsProvider>
    </ThemeProvider>
  );
}
