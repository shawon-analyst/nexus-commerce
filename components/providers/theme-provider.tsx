'use client';

import type { ComponentProps } from 'react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Thin client wrapper around next-themes.
 *
 * `attribute="class"` matches `darkMode: ['class']` in tailwind.config.ts, and
 * `disableTransitionOnChange` stops the whole page from cross-fading every
 * colour when the theme flips (which looks cheap on a big product grid).
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
