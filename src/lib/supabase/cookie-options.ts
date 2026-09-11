import type { CookieOptionsWithName } from '@supabase/ssr'

/**
 * セッション Cookie の共通設定
 * ・本番は HTTPS のみで送信
 * ・ライブラリ既定の 400 日ではなく、操作がなければ 12 時間で失効させる
 *   （トークン更新のたびに期限は延長される）
 */
export const supabaseCookieOptions: CookieOptionsWithName = {
  path: '/',
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 12,
}
