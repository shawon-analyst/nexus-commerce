'use client';

import * as React from 'react';
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from '@/lib/site-settings';

/**
 * The live shop settings, available to every client component.
 *
 * The values are read once on the server (the root layout calls
 * `getSiteSettings()`) and handed down as props, so there is no client fetch, no
 * loading state and no chance of the cart quoting a stale fee. A save in
 * `/admin/settings` revalidates the server cache and refreshes the route, which
 * re-seeds this provider.
 *
 * The default exists so a component rendered outside the provider (a test, a
 * future embed) still gets the documented ৳60 / ৳120 rather than `undefined`.
 */
const SiteSettingsContext = React.createContext<SiteSettings>(DEFAULT_SITE_SETTINGS);

export function SiteSettingsProvider({
  settings,
  children,
}: {
  settings: SiteSettings;
  children: React.ReactNode;
}) {
  return (
    <SiteSettingsContext.Provider value={settings}>{children}</SiteSettingsContext.Provider>
  );
}

export function useSiteSettings(): SiteSettings {
  return React.useContext(SiteSettingsContext);
}
