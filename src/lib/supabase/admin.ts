import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * service_role キーを使う管理用クライアント（RLS をバイパスする）
 * 必ず Server Action / Route Handler 内で権限チェックをしてから使うこと
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY が設定されていません')
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
