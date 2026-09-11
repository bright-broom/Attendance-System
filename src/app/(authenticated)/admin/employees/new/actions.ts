'use server'

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
const MIN_PASSWORD_LENGTH = 8

function includes<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value)
}

/**
 * 社員を登録する（管理者のみ）
 * 認証ユーザーの作成は service_role で行い、管理者自身のセッションには影響させない
 */
export async function createEmployee(input: CreateEmployeeInput): Promise<{ error: string } | { error: null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'ログインしてください' }
  }

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (currentEmployee?.role !== 'admin') {
    return { error: '社員を登録する権限がありません' }
  }

  // 入力検証
  const email = input.email.trim().toLowerCase()
  const name = input.name.trim()
  const employeeNumber = input.employee_number.trim()

  for (const [value, rule] of [
    [email, 'email'],
    [employeeNumber, 'employeeNumber'],
    [name, 'name'],
  ] as const) {
    const result = validate(value, rule)
    if (!result.isValid) {
      return { error: result.error || '入力内容に誤りがあります' }
    }
  }

  if (input.password.length < MIN_PASSWORD_LENGTH) {
    return { error: `初期パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください` }
  }
  if (!includes(ROLES, input.role) || !includes(EMPLOYMENT_TYPES, input.employment_type)) {
    return { error: '権限または雇用区分が不正です' }
  }
  if (!DATE_PATTERN.test(input.hire_date)) {
    return { error: '入社日を入力してください' }
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
    await admin.auth.admin.deleteUser(authData.user.id)
    return {
      error: empError.code === '23505'
        ? '社員番号またはメールアドレスが既に使われています'
        : '社員情報の登録に失敗しました',
    }
  }

  return { error: null }
}
