import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === 'development';

// Supabase の接続先（使用しているプロジェクトのみ許可する）
const supabaseOrigins = (() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];
  const { origin } = new URL(url);
  return [origin, origin.replace(/^http/, 'ws')];
})();

const securityHeaders = [
  // 旧ブラウザの XSS フィルタは誤検知による情報漏えいの原因になるため無効化（CSP で対策する）
  {
    key: 'X-XSS-Protection',
    value: '0',
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
    value: 'camera=(), microphone=(), geolocation=(self)',
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
      // 'unsafe-eval' は開発時（React のデバッグ機能）のみ必要
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      ["connect-src 'self'", ...supabaseOrigins].join(' '),
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "base-uri 'self'",
      ...(isDev ? [] : ['upgrade-insecure-requests']),
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // フレームワーク情報をレスポンスヘッダーに出さない
  poweredByHeader: false,
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
