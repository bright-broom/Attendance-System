import type { NextConfig } from "next";

// Supabase の接続先（ローカルの supabase start など *.supabase.co 以外にも対応）
const supabaseOrigins = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  const { origin } = new URL(url);
  return [origin, origin.replace(/^http/, 'ws')];
})();

const securityHeaders = [
  // XSS攻撃対策
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  // クリックジャッキング対策
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  // MIMEタイプスニッフィング対策
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  // リファラー情報の制御
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  // 権限ポリシー
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
  },
  // HTTPS強制（本番環境用）
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  // CSP（コンテンツセキュリティポリシー）
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'", // Next.js requires unsafe-eval/inline
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      ["connect-src 'self' https://*.supabase.co wss://*.supabase.co", ...supabaseOrigins].join(' '),
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
