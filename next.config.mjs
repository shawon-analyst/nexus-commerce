/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lets us run a production build into a separate folder while `next dev`
  // is still running, so the two processes never share/overwrite `.next`.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    /*
     * Product photos are typed into the admin form and avatars arrive from OAuth
     * or the `avatars` bucket, so remote URLs are expected — but the allow-list
     * is explicit rather than `hostname: '**'`.
     *
     * `/_next/image` fetches whatever URL it is handed, which is why Next has
     * shipped a stream of advisories against it (SSRF, DoS, unbounded cache
     * growth, and an unauthenticated RCE in AVIF handling fixed in 15.5.24). A
     * wildcard allow-list is precisely what turns those into remote attack
     * surface, because anybody can point the optimizer at a file they control.
     * Adding a host here is a one-line change; keeping the list closed is the
     * cheapest mitigation until the framework is upgraded.
     */
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' }, // seeded catalogue
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' }, // Google avatars
      { protocol: 'https', hostname: '*.fbcdn.net' }, // Facebook avatars
      { protocol: 'https', hostname: '*.supabase.co' }, // Storage: uploads, products
      { protocol: 'http', hostname: 'localhost' }, // local development
    ],
    // AVIF stays off, so the optimizer is never handed an AVIF source.
    formats: ['image/webp'],
  },
  experimental: {
    // keeps large admin tables snappy
    optimizePackageImports: ['lucide-react'],
  },
  // Safe, deployment-agnostic hardening. HSTS only takes effect over HTTPS, so
  // it is inert on a local http:// dev server.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
