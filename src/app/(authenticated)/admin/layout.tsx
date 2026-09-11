import type { ReactNode } from 'react'
import { requireRole } from '@/lib/auth'

// 管理画面は管理者のみ（各ページでも個別にチェックする）
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole('admin')
  return children
}
