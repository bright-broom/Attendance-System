'use client'

import { useState, useCallback, memo, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ClockDisplay } from '@/components/clock-display'
import { formatTime } from '@/lib/utils'
import type { AttendanceType } from '@/types/database'
import styles from './page.module.css'

interface Employee {
  id: string
  name: string
}

interface AttendanceRecord {
  id: string
  attendance_type: string
  recorded_at: string
}

interface AttendanceClientProps {
  initialEmployee: Employee | null
  initialRecords: AttendanceRecord[]
}

const TYPE_LABELS: Record<string, string> = {
  clock_in: '出勤',
  clock_out: '退勤',
  break_start: '休憩開始',
  break_end: '休憩終了',
}

// メモ化された打刻履歴アイテム
const RecordItem = memo(function RecordItem({
  record,
}: {
  record: AttendanceRecord
}) {
  return (
    <li className={styles.record}>
      <span className={styles.recordType}>
        {TYPE_LABELS[record.attendance_type]}
      </span>
      <span className={styles.recordTime}>
        {formatTime(record.recorded_at)}
      </span>
    </li>
  )
})

// メモ化されたステータス表示
const StatusDisplay = memo(function StatusDisplay({
  clockIn,
  clockOut,
  isOnBreak,
}: {
  clockIn: AttendanceRecord | undefined
  clockOut: AttendanceRecord | undefined
  isOnBreak: boolean
}) {
  return (
    <div className={styles.statusGrid}>
      <div className={styles.statusItem}>
        <span className={styles.statusLabel}>出勤</span>
        <span className={styles.statusValue}>
          {clockIn ? formatTime(clockIn.recorded_at) : '--:--'}
        </span>
      </div>
      <div className={styles.statusItem}>
        <span className={styles.statusLabel}>退勤</span>
        <span className={styles.statusValue}>
          {clockOut ? formatTime(clockOut.recorded_at) : '--:--'}
        </span>
      </div>
      <div className={styles.statusItem}>
        <span className={styles.statusLabel}>休憩</span>
        <span className={styles.statusValue}>
          {isOnBreak ? '休憩中' : '-'}
        </span>
      </div>
    </div>
  )
})

// Supabaseクライアントをモジュールレベルでキャッシュ
let supabaseClient: ReturnType<typeof createClient> | null = null
const getSupabase = () => {
  if (!supabaseClient) {
    supabaseClient = createClient()
  }
  return supabaseClient
}

export function AttendanceClient({
  initialEmployee,
  initialRecords,
}: AttendanceClientProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>(initialRecords)
  const [loadingType, setLoadingType] = useState<string | null>(null)

  // レコードからステータスを計算（メモ化）
  const { clockIn, clockOut, isOnBreak } = useMemo(() => {
    const getLastRecord = (types: string[]) =>
      records.filter((r) => types.includes(r.attendance_type)).slice(-1)[0]

    return {
      clockIn: getLastRecord(['clock_in']),
      clockOut: getLastRecord(['clock_out']),
      // 最後の休憩系の打刻が「休憩開始」なら休憩中（複数回の休憩に対応）
      isOnBreak: getLastRecord(['break_start', 'break_end'])?.attendance_type === 'break_start',
    }
  }, [records])

  // ボタンの有効状態（メモ化）
  const buttonStates = useMemo(() => ({
    canClockIn: initialEmployee && !clockIn,
    canClockOut: initialEmployee && clockIn && !clockOut,
    canBreakStart: initialEmployee && clockIn && !clockOut && !isOnBreak,
    canBreakEnd: initialEmployee && clockIn && !clockOut && isOnBreak,
  }), [initialEmployee, clockIn, clockOut, isOnBreak])

  // 楽観的UI更新付き打刻処理
  const handlePunch = useCallback(async (type: AttendanceType) => {
    if (!initialEmployee) return

    setLoadingType(type)

    // 楽観的UI更新: 即座にUIを更新
    const optimisticRecord: AttendanceRecord = {
      id: `temp-${Date.now()}`,
      attendance_type: type,
      recorded_at: new Date().toISOString(),
    }

    setRecords(prev => [...prev, optimisticRecord])

    try {
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from('attendance_records')
        // 打刻時刻はサーバー（DB）側で記録する
        .insert({
          employee_id: initialEmployee.id,
          attendance_type: type,
        })
        .select('id, attendance_type, recorded_at')
        .single()

      if (error) {
        // エラー時は楽観的更新をロールバック
        setRecords(prev => prev.filter(r => r.id !== optimisticRecord.id))
        alert('打刻に失敗しました')
      } else if (data) {
        // 成功時は一時IDを実際のIDに置き換え
        setRecords(prev =>
          prev.map(r => r.id === optimisticRecord.id ? data : r)
        )
      }
    } catch {
      setRecords(prev => prev.filter(r => r.id !== optimisticRecord.id))
      alert('打刻に失敗しました')
    } finally {
      setLoadingType(null)
    }
  }, [initialEmployee])

  if (!initialEmployee) {
    return (
      <div className={styles.container}>
        <h1 className={styles.title}>打刻</h1>
        <Card>
          <CardContent>
            <p className={styles.noRecords}>社員情報が見つかりません</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>打刻</h1>

      <div className={styles.grid}>
        <Card>
          <CardHeader>
            <ClockDisplay
              dateClassName={styles.dateTitle}
              timeClassName={styles.time}
              secondsClassName={styles.seconds}
            />
          </CardHeader>
          <CardContent>
            <div className={styles.buttons}>
              <Button
                size="lg"
                onClick={() => handlePunch('clock_in')}
                disabled={!buttonStates.canClockIn}
                isLoading={loadingType === 'clock_in'}
                className={styles.punchButton}
              >
                出勤
              </Button>
              <Button
                size="lg"
                variant="danger"
                onClick={() => handlePunch('clock_out')}
                disabled={!buttonStates.canClockOut}
                isLoading={loadingType === 'clock_out'}
                className={styles.punchButton}
              >
                退勤
              </Button>
            </div>

            <div className={styles.breakButtons}>
              <Button
                variant="secondary"
                onClick={() => handlePunch('break_start')}
                disabled={!buttonStates.canBreakStart}
                isLoading={loadingType === 'break_start'}
              >
                休憩開始
              </Button>
              <Button
                variant="secondary"
                onClick={() => handlePunch('break_end')}
                disabled={!buttonStates.canBreakEnd}
                isLoading={loadingType === 'break_end'}
              >
                休憩終了
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>本日の打刻履歴</CardTitle>
          </CardHeader>
          <CardContent>
            {records.length > 0 ? (
              <ul className={styles.records}>
                {records.map((record) => (
                  <RecordItem key={record.id} record={record} />
                ))}
              </ul>
            ) : (
              <p className={styles.noRecords}>打刻履歴がありません</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className={styles.statusCard}>
        <CardHeader>
          <CardTitle>現在のステータス</CardTitle>
        </CardHeader>
        <CardContent>
          <StatusDisplay
            clockIn={clockIn}
            clockOut={clockOut}
            isOnBreak={isOnBreak}
          />
        </CardContent>
      </Card>
    </div>
  )
}
