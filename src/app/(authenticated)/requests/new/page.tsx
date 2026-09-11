'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VALIDATION_RULES } from '@/lib/security'
import type { RequestType, LeaveType } from '@/types/database'
import { createRequest } from '../actions'
import styles from './page.module.css'

const MAX_REASON_LENGTH = VALIDATION_RULES.reason.maxLength

export default function NewRequestPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const [formData, setFormData] = useState({
    request_type: 'leave' as RequestType,
    start_date: '',
    end_date: '',
    reason: '',
    leave_type: 'paid' as LeaveType,
  })

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {}

    // 開始日チェック
    if (!formData.start_date) {
      errors.start_date = '開始日は必須です'
    }

    // 終了日チェック（指定された場合は開始日以降か）
    if (formData.end_date && formData.start_date) {
      if (new Date(formData.end_date) < new Date(formData.start_date)) {
        errors.end_date = '終了日は開始日以降を指定してください'
      }
    }

    // 理由チェック
    if (!formData.reason.trim()) {
      errors.reason = '申請理由は必須です'
    } else if (formData.reason.length > MAX_REASON_LENGTH) {
      errors.reason = VALIDATION_RULES.reason.message
    }

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }, [formData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) {
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // 申請者はサーバー側でログイン中の社員に決まる。入力もサーバー側で再検証する
      const { error: createError } = await createRequest(formData)

      if (createError) {
        setError(createError)
        setIsLoading(false)
        return
      }

      router.push('/requests')
      router.refresh()
    } catch {
      setError('申請処理中にエラーが発生しました')
      setIsLoading(false)
    }
  }

  const requestTypeLabels: Record<RequestType, string> = {
    overtime: '残業申請',
    holiday_work: '休日出勤申請',
    leave: '休暇申請',
    attendance_correction: '勤怠修正申請',
  }

  const leaveTypeLabels: Record<LeaveType, string> = {
    paid: '有給休暇',
    substitute: '代休',
    sick: '病欠',
    special: '特別休暇',
  }

  const remainingChars = MAX_REASON_LENGTH - formData.reason.length

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>新規申請</h1>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="request_type" className={styles.label}>
                申請種別
              </label>
              <select
                id="request_type"
                className={styles.select}
                value={formData.request_type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    request_type: e.target.value as RequestType,
                  })
                }
                required
              >
                {Object.entries(requestTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {formData.request_type === 'leave' && (
              <div className={styles.field}>
                <label htmlFor="leave_type" className={styles.label}>
                  休暇種別
                </label>
                <select
                  id="leave_type"
                  className={styles.select}
                  value={formData.leave_type}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      leave_type: e.target.value as LeaveType,
                    })
                  }
                  required
                >
                  {Object.entries(leaveTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.dateRange}>
              <div>
                <Input
                  id="start_date"
                  type="date"
                  label="開始日"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                  required
                />
                {validationErrors.start_date && (
                  <p className={styles.fieldError}>{validationErrors.start_date}</p>
                )}
              </div>
              <div>
                <Input
                  id="end_date"
                  type="date"
                  label="終了日"
                  value={formData.end_date}
                  onChange={(e) =>
                    setFormData({ ...formData, end_date: e.target.value })
                  }
                  min={formData.start_date}
                />
                {validationErrors.end_date && (
                  <p className={styles.fieldError}>{validationErrors.end_date}</p>
                )}
              </div>
            </div>

            <div className={styles.field}>
              <label htmlFor="reason" className={styles.label}>
                申請理由
                <span className={styles.charCount}>
                  {remainingChars < 50 && `残り${remainingChars}文字`}
                </span>
              </label>
              <textarea
                id="reason"
                className={`${styles.textarea} ${validationErrors.reason ? styles.textareaError : ''}`}
                value={formData.reason}
                onChange={(e) =>
                  setFormData({ ...formData, reason: e.target.value })
                }
                required
                rows={4}
                maxLength={MAX_REASON_LENGTH}
                placeholder="申請理由を入力してください"
              />
              {validationErrors.reason && (
                <p className={styles.fieldError}>{validationErrors.reason}</p>
              )}
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.back()}
              >
                キャンセル
              </Button>
              <Button type="submit" isLoading={isLoading}>
                申請する
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
