import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type EmployeeRole = 'admin' | 'manager' | 'employee'

/** ログイン中の社員（サーバー内でのみ扱う。クライアントには必要な項目だけ渡す） */
export interface CurrentEmployee {
  id: string
  name: string
  email: string
  role: EmployeeRole
  departmentId: string | null
  departmentName: string | null
}

/**
 * ログイン中の有効な社員を取得する（同一リクエスト内ではキャッシュされる）
 * 未ログイン・社員未登録・無効化済みの場合は null
 */
export const getCurrentEmployee = cache(async (): Promise<CurrentEmployee | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('employees')
    .select('id, name, email, role, is_active, department_id, departments(name)')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data?.is_active) return null

  const departments = data.departments as { name: string } | { name: string }[] | null
  const departmentName = Array.isArray(departments) ? departments[0]?.name : departments?.name

  return {
    id: data.id,
    name: data.name,
    email: data.email,
    role: data.role,
    departmentId: data.department_id,
    departmentName: departmentName ?? null,
  }
})

/** ページ用: 有効な社員でなければログイン画面へ */
export async function requireEmployee(): Promise<CurrentEmployee> {
  const employee = await getCurrentEmployee()
  if (!employee) redirect('/login')
  return employee
}

/** ページ用: 指定ロールでなければダッシュボードへ */
export async function requireRole(...roles: EmployeeRole[]): Promise<CurrentEmployee> {
  const employee = await requireEmployee()
  if (!roles.includes(employee.role)) redirect('/dashboard')
  return employee
}
