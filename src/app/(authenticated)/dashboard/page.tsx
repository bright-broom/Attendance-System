import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  formatDate,
  formatTime,
  getDaysInMonth,
  getTodayString,
  minutesToHoursMinutes,
  toDateString,
} from '@/lib/utils'
import Link from 'next/link'
import styles from './page.module.css'

export default async function DashboardPage() {
  const employee = await requireEmployee()
  const supabase = await createClient()

  // 日付計算（日本時間）
  const today = new Date()
  const todayStr = getTodayString(today)
  const [year, month] = todayStr.split('-').map(Number)
  const firstDayOfMonth = toDateString(year, month, 1)
  const lastDayOfMonth = toDateString(year, month, getDaysInMonth(year, month))
  const fiscalYear = month >= 4 ? year : year - 1

  // 全クエリを並列実行
  const [
    { data: monthlyData },
    { data: todayAttendance },
    { count: pendingCount },
    { data: leaveBalance },
  ] = await Promise.all([
    // 今月の勤怠サマリ
    supabase
      .from('daily_attendances')
      .select('actual_work_minutes, overtime_minutes, status')
      .eq('employee_id', employee.id)
      .gte('work_date', firstDayOfMonth)
      .lte('work_date', lastDayOfMonth),
    // 今日の勤怠
    supabase
      .from('daily_attendances')
      .select('clock_in, clock_out, actual_work_minutes')
      .eq('employee_id', employee.id)
      .eq('work_date', todayStr)
      .single(),
    // 未承認の申請件数
    supabase
      .from('requests')
      .select('*', { count: 'exact', head: true })
      .eq('employee_id', employee.id)
      .eq('status', 'pending'),
    // 有休残高
    supabase
      .from('leave_balances')
      .select('granted_days, used_days, remaining_days')
      .eq('employee_id', employee.id)
      .eq('fiscal_year', fiscalYear)
      .eq('leave_type', 'paid')
      .single(),
  ])

  // 月次集計
  const totalWorkMinutes = monthlyData?.reduce((sum, d) => sum + (d.actual_work_minutes || 0), 0) || 0
  const totalOvertimeMinutes = monthlyData?.reduce((sum, d) => sum + (d.overtime_minutes || 0), 0) || 0
  const workDays = monthlyData?.filter((d) => d.status === 'present').length || 0

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>ダッシュボード</h1>

      <div className={styles.grid}>
        {/* 今日の勤怠状況 */}
        <Card>
          <CardHeader>
            <CardTitle>今日の勤怠 - {formatDate(today, 'M月d日(E)')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.todayStatus}>
              {todayAttendance ? (
                <>
                  <div className={styles.timeRow}>
                    <span className={styles.timeLabel}>出勤</span>
                    <span className={styles.timeValue}>
                      {todayAttendance.clock_in
                        ? formatTime(todayAttendance.clock_in)
                        : '--:--'}
                    </span>
                  </div>
                  <div className={styles.timeRow}>
                    <span className={styles.timeLabel}>退勤</span>
                    <span className={styles.timeValue}>
                      {todayAttendance.clock_out
                        ? formatTime(todayAttendance.clock_out)
                        : '--:--'}
                    </span>
                  </div>
                  <div className={styles.timeRow}>
                    <span className={styles.timeLabel}>実働時間</span>
                    <span className={styles.timeValue}>
                      {minutesToHoursMinutes(todayAttendance.actual_work_minutes || 0)}
                    </span>
                  </div>
                </>
              ) : (
                <p className={styles.noData}>まだ打刻がありません</p>
              )}
              <Link href="/attendance" className={styles.link}>
                打刻する →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* 今月のサマリ */}
        <Card>
          <CardHeader>
            <CardTitle>今月のサマリ</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>出勤日数</span>
                <span className={styles.summaryValue}>{workDays}日</span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>総労働時間</span>
                <span className={styles.summaryValue}>
                  {minutesToHoursMinutes(totalWorkMinutes)}
                </span>
              </div>
              <div className={styles.summaryItem}>
                <span className={styles.summaryLabel}>残業時間</span>
                <span className={styles.summaryValue}>
                  {minutesToHoursMinutes(totalOvertimeMinutes)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 有休残高 */}
        <Card>
          <CardHeader>
            <CardTitle>有休残高</CardTitle>
          </CardHeader>
          <CardContent>
            {leaveBalance ? (
              <div className={styles.leaveBalance}>
                <div className={styles.balanceMain}>
                  <span className={styles.balanceValue}>
                    {leaveBalance.remaining_days}
                  </span>
                  <span className={styles.balanceUnit}>日</span>
                </div>
                <div className={styles.balanceDetail}>
                  付与: {leaveBalance.granted_days}日 / 使用: {leaveBalance.used_days}日
                </div>
              </div>
            ) : (
              <p className={styles.noData}>有休情報がありません</p>
            )}
          </CardContent>
        </Card>

        {/* 申請状況 */}
        <Card>
          <CardHeader>
            <CardTitle>申請状況</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingCount && pendingCount > 0 ? (
              <div className={styles.requests}>
                <p className={styles.pendingCount}>
                  承認待ち: <strong>{pendingCount}件</strong>
                </p>
                <Link href="/requests" className={styles.link}>
                  申請一覧を見る →
                </Link>
              </div>
            ) : (
              <p className={styles.noData}>承認待ちの申請はありません</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
