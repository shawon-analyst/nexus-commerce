import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from '@/app/providers';
import { JsonLd } from '@/components/seo/json-ld';
import { getCurrentProfile } from '@/lib/queries';
import { organizationSchema, websiteSchema } from '@/lib/structured-data';
import {
  OG_IMAGE,
  OG_IMAGE_PATH,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  absoluteUrl,
  openGraphDefaults,
} from '@/lib/seo';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

const homeTitle = `${SITE_NAME} — ${SITE_TAGLINE}`;

/**
 * Defaults for the whole site. Pages that need their own share card only
 * override the fields that differ — `alternates.canonical` deliberately lives
 * on the pages instead, because a canonical here would be inherited by every
 * child segment and point them all at `/`.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: homeTitle,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: ['ecommerce', 'electronics', 'audio', 'wearables', 'online store', 'bangladesh'],
  openGraph: {
    ...openGraphDefaults,
    title: homeTitle,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [OG_IMAGE],
  },
  twitter: {
    card: 'summary_large_image',
    title: homeTitle,
    description: SITE_DESCRIPTION,
    images: [absoluteUrl(OG_IMAGE_PATH)],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export const viewport: Viewport = {
  // Follows the visitor's system preference until they pick a theme.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Server-side bootstrap of the auth context: no loading flash, no extra round-trip.
  const profile = await getCurrentProfile();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        {/* Site-wide structured data: the Organization node and the WebSite node. */}
        <JsonLd data={[organizationSchema(), websiteSchema()]} />
        <Providers
          initialUser={profile ? { id: profile.id, email: profile.email } : null}
          initialProfile={profile}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
