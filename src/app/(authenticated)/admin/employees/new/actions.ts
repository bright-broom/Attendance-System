'use server'

import { getCurrentEmployee } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validate } from '@/lib/security'

export interface CreateEmployeeInput {
  email: string
  password: string
  employee_number: string
  name: string
  department_id: string
  role: string
  employment_type: string
  manager_id: string
  hire_date: string
}

const ROLES = ['admin', 'manager', 'employee'] as const
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract'] as const
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const STRING_FIELDS = [
  'email', 'password', 'employee_number', 'name', 'department_id',
  'role', 'employment_type', 'manager_id', 'hire_date',
] as const

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value)
}

/**
 * 社員を登録する（管理者のみ）
 * 認証ユーザーの作成は service_role で行い、管理者自身のセッションには影響させない
 */
export async function createEmployee(input: CreateEmployeeInput): Promise<{ error: string } | { error: null }> {
  // 有効な管理者のみ（無効化された管理者は getCurrentEmployee が null を返す）
  const currentEmployee = await getCurrentEmployee()
  if (currentEmployee?.role !== 'admin') {
    return { error: '社員を登録する権限がありません' }
  }

  // 入力検証（クライアントからは任意の値が届く前提で型から確認する）
  if (typeof input !== 'object' || input === null || STRING_FIELDS.some((key) => typeof input[key] !== 'string')) {
    return { error: '入力内容に誤りがあります' }
  }

  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const employeeNumber = input.employee_number.trim()

  for (const [value, rule] of [
    [email, 'email'],
    [employeeNumber, 'employeeNumber'],
    [name, 'name'],
    [input.password, 'password'],
  ] as const) {
    const result = validate(value, rule)
    if (!result.isValid) {
      return { error: result.error || '入力内容に誤りがあります' }
    }
  }

  if (!includes(ROLES, input.role) || !includes(EMPLOYMENT_TYPES, input.employment_type)) {
    return { error: '権限または雇用区分が不正です' }
  }
  if (!DATE_PATTERN.test(input.hire_date)) {
    return { error: '入社日を入力してください' }
  }
  if ([input.department_id, input.manager_id].some((id) => id && !UUID_PATTERN.test(id))) {
    return { error: '部門または上長の指定が不正です' }
  }

  // 認証ユーザーを作成
  const admin = createAdminClient()
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  })

  if (authError || !authData.user) {
    return {
      error: authError?.code === 'email_exists'
        ? 'このメールアドレスは既に登録されています'
        : 'ユーザーの作成に失敗しました',
    }
  }

  // 社員情報を登録（管理者本人の権限で実行し、RLS も適用する）
  const supabase = await createClient()
  const { error: empError } = await supabase.from('employees').insert({
    user_id: authData.user.id,
    employee_number: employeeNumber,
    name,
    email,
    department_id: input.department_id || null,
    role: input.role,
    employment_type: input.employment_type,
    manager_id: input.manager_id || null,
    hire_date: input.hire_date,
  })

  if (empError) {
    // 社員登録に失敗したら作成した認証ユーザーを削除して元に戻す
    const { error: rollbackError } = await admin.auth.admin.deleteUser(authData.user.id)
    if (rollbackError) {
      console.error('[createEmployee] 認証ユーザーの削除に失敗しました', authData.user.id, rollbackError.message)
    }
    return {
      error: empError.code === '23505'
        ? '社員番号またはメールアドレスが既に使われています'
        : '社員情報の登録に失敗しました',
    }
  }

  return { error: null }
}
