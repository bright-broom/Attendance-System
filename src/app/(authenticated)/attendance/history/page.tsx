import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  formatTime,
  getDayOfWeek,
  getDaysInMonth,
  minutesToHoursMinutes,
  toDateString,
} from '@/lib/utils'
import { parseMonthParam } from '@/lib/security'
import { MonthSelector } from './month-selector'
import styles from './page.module.css'

interface PageProps {
  searchParams: Promise<{ month?: string }>
}

export default async function AttendanceHistoryPage({ searchParams }: PageProps) {
  const params = await searchParams
  const employee = await requireEmployee()
  const supabase = await createClient()

  // 対象月を決定（不正な値のときは日本時間の今月）
  const { year, month } = parseMonthParam(params.month)
  const targetMonth = `${year}-${String(month).padStart(2, '0')}`

  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = toDateString(year, month, 1)
  const lastDay = toDateString(year, month, daysInMonth)

  // 勤怠データを取得
  const { data: attendances } = await supabase
    .from('daily_attendances')
    .select('*')
    .eq('employee_id', employee.id)
    .gte('work_date', firstDay)
    .lte('work_date', lastDay)
    .order('work_date', { ascending: true })

  // 月次サマリを計算
  const summary = {
    workDays: attendances?.filter((a) => a.status === 'present').length || 0,
    totalWorkMinutes: attendances?.reduce((sum, a) => sum + (a.actual_work_minutes || 0), 0) || 0,
    totalOvertimeMinutes: attendances?.reduce((sum, a) => sum + (a.overtime_minutes || 0), 0) || 0,
    totalLateNightMinutes: attendances?.reduce((sum, a) => sum + (a.late_night_minutes || 0), 0) || 0,
    leaveDays: attendances?.filter((a) => a.status === 'leave').length || 0,
  }

  const statusLabels: Record<string, string> = {
    present: '出勤',
    absent: '欠勤',
    holiday: '休日',
    leave: '休暇',
  }

  // Mapで勤怠データを高速ルックアップ可能に (O(1))
  const attendanceMap = new Map(
    attendances?.map((a) => [a.work_date, a]) || []
  )

  // カレンダー用の日付配列を生成
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const dateStr = toDateString(year, month, i + 1)
    const dayOfWeek = getDayOfWeek(dateStr)
    return {
      date: dateStr,
      dayOfMonth: i + 1,
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      attendance: attendanceMap.get(dateStr),
    }
  })

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>勤怠履歴</h1>
        <MonthSelector currentMonth={targetMonth} />
      </div>

      {/* 月次サマリ */}
      <Card className={styles.summaryCard}>
        <CardHeader>
          <CardTitle>{year}年{month}月のサマリ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>出勤日数</span>
              <span className={styles.summaryValue}>{summary.workDays}日</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>総労働時間</span>
              <span className={styles.summaryValue}>
                {minutesToHoursMinutes(summary.totalWorkMinutes)}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>残業時間</span>
              <span className={styles.summaryValue}>
                {minutesToHoursMinutes(summary.totalOvertimeMinutes)}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>深夜時間</span>
              <span className={styles.summaryValue}>
                {minutesToHoursMinutes(summary.totalLateNightMinutes)}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>休暇日数</span>
              <span className={styles.summaryValue}>{summary.leaveDays}日</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 日別一覧 */}
      <Card>
        <CardHeader>
          <CardTitle>日別勤怠</CardTitle>
        </CardHeader>
        <CardContent className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>日付</th>
                <th>曜日</th>
                <th>ステータス</th>
                <th>出勤</th>
                <th>退勤</th>
                <th>休憩</th>
                <th>実働</th>
                <th>残業</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr
                  key={day.date}
                  className={day.isWeekend ? styles.weekend : ''}
                >
                  <td>{day.dayOfMonth}</td>
                  <td>{['日', '月', '火', '水', '木', '金', '土'][day.dayOfWeek]}</td>
                  <td>
                    {day.attendance ? (
                      <span
                        className={`${styles.status} ${styles[day.attendance.status]}`}
                      >
                        {statusLabels[day.attendance.status]}
                      </span>
                    ) : day.isWeekend ? (
                      <span className={`${styles.status} ${styles.holiday}`}>
                        休日
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td>
                    {day.attendance?.clock_in
                      ? formatTime(day.attendance.clock_in)
                      : '-'}
                  </td>
                  <td>
                    {day.attendance?.clock_out
                      ? formatTime(day.attendance.clock_out)
                      : '-'}
                  </td>
                  <td>
                    {day.attendance?.break_minutes
                      ? minutesToHoursMinutes(day.attendance.break_minutes)
                      : '-'}
                  </td>
                  <td>
                    {day.attendance?.actual_work_minutes
                      ? minutesToHoursMinutes(day.attendance.actual_work_minutes)
                      : '-'}
                  </td>
                  <td>
                    {day.attendance?.overtime_minutes
                      ? minutesToHoursMinutes(day.attendance.overtime_minutes)
                      : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
