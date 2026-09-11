'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentEmployee } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { VALIDATION_RULES } from '@/lib/security'

type ActionResult = { error: string | null }

const REQUEST_TYPES = ['overtime', 'holiday_work', 'leave', 'attendance_correction'] as const
const LEAVE_TYPES = ['paid', 'substitute', 'sick', 'special'] as const
const APPROVAL_ACTIONS = ['approved', 'rejected', 'returned'] as const
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value)
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
}

export interface CreateRequestInput {
  request_type: string
  start_date: string
  end_date: string
  reason: string
  leave_type: string
}

/** 申請を作成する（本人名義・承認待ちで作成） */
export async function createRequest(input: CreateRequestInput): Promise<ActionResult> {
  const employee = await getCurrentEmployee()
  if (!employee) {
    return { error: 'ログインしてください' }
  }

  if (typeof input !== 'object' || input === null || !isOneOf(REQUEST_TYPES, input.request_type)) {
    return { error: '申請種別が不正です' }
  }
  const endDate = input.end_date || input.start_date
  if (!isValidDate(input.start_date) || !isValidDate(endDate) || endDate < input.start_date) {
    return { error: '対象期間が不正です' }
  }
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''
  if (!reason || reason.length > VALIDATION_RULES.reason.maxLength) {
    return { error: VALIDATION_RULES.reason.message }
  }
  const isLeave = input.request_type === 'leave'
  const leaveType = isOneOf(LEAVE_TYPES, input.leave_type) ? input.leave_type : null
  if (isLeave && !leaveType) {
    return { error: '休暇種別が不正です' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('requests').insert({
    employee_id: employee.id,
    request_type: input.request_type,
    start_date: input.start_date,
    end_date: endDate,
    reason,
    leave_type: isLeave ? leaveType : null,
  })

  if (error) {
    return { error: '申請の登録に失敗しました' }
  }

  revalidatePath('/requests')
  return { error: null }
}

/**
 * 申請を承認・却下・差し戻しする
 * 権限（管理者または申請者の上長、本人以外）と状態のチェック、承認記録の作成、
 * ステータス更新は DB 関数 decide_request が 1 トランザクションで行う
 */
export async function decideRequest(requestId: string, action: string, comment: string): Promise<ActionResult> {
  const employee = await getCurrentEmployee()
  if (!employee || !['admin', 'manager'].includes(employee.role)) {
    return { error: 'この操作を行う権限がありません' }
  }
  if (typeof requestId !== 'string' || !UUID_PATTERN.test(requestId) || !isOneOf(APPROVAL_ACTIONS, action)) {
    return { error: '不正なリクエストです' }
  }
  const trimmedComment = typeof comment === 'string' ? comment.trim() : ''
  if (trimmedComment.length > VALIDATION_RULES.comment.maxLength) {
    return { error: VALIDATION_RULES.comment.message }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('decide_request', {
    p_request_id: requestId,
    p_action: action,
    p_comment: trimmedComment || undefined,
  })

  if (error) {
    // 権限・状態エラーは DB 関数のメッセージ（利用者向けの文言）をそのまま返す
    return { error: error.code === 'P0001' ? error.message : '処理に失敗しました' }
  }

  revalidatePath('/requests/approval')
  return { error: null }
}
