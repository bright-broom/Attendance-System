import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { getDaysInMonth, minutesToHoursMinutes, toDateString } from '@/lib/utils'
import { parseMonthParam } from '@/lib/security'
import { MonthSelector } from '@/app/(authenticated)/attendance/history/month-selector'
import styles from './page.module.css'

interface PageProps {
  searchParams: Promise<{ month?: string }>
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: currentEmployee } = await supabase
    .from('employees')
    .select('role')
    .eq('user_id', user.id)
    .single()

  if (currentEmployee?.role !== 'admin') {
    redirect('/dashboard')
  }

  // 対象月を決定（不正な値のときは日本時間の今月）
  const { year, month } = parseMonthParam(params.month)
  const targetMonth = `${year}-${String(month).padStart(2, '0')}`

  const firstDay = toDateString(year, month, 1)
  const lastDay = toDateString(year, month, getDaysInMonth(year, month))

  // 全クエリを並列実行
  const [
    { data: departmentSummary },
    { data: overtimeAlerts },
    { data: allAttendances },
    { count: activeEmployeeCount },
  ] = await Promise.all([
    // 部門別サマリ
    supabase
      .from('employees')
      .select(`
        department_id,
        departments(name),
        daily_attendances!inner(
          actual_work_minutes,
          overtime_minutes,
          late_night_minutes,
          status
        )
      `)
      .eq('is_active', true)
      .gte('daily_attendances.work_date', firstDay)
      .lte('daily_attendances.work_date', lastDay),
    // 残業アラート対象者
    supabase
      .from('employees')
      .select(`
        id,
        name,
        employee_number,
        departments(name),
        daily_attendances(overtime_minutes)
      `)
      .eq('is_active', true)
      .gte('daily_attendances.work_date', firstDay)
      .lte('daily_attendances.work_date', lastDay),
    // 全体勤怠サマリ
    supabase
      .from('daily_attendances')
      .select('actual_work_minutes, overtime_minutes, status')
      .gte('work_date', firstDay)
      .lte('work_date', lastDay),
    // 有効社員数
    supabase
      .from('employees')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true),
  ])

  // 部門別に集計
  const deptStats: Record<string, {
    name: string
    employeeCount: Set<string>
    totalWorkMinutes: number
    totalOvertimeMinutes: number
    workDays: number
  }> = {}

  departmentSummary?.forEach((emp) => {
    const deptId = emp.department_id || 'none'
    const departments = emp.departments as { name: string } | { name: string }[] | null
    const deptName = Array.isArray(departments) ? departments[0]?.name : departments?.name || '未所属'

    if (!deptStats[deptId]) {
      deptStats[deptId] = {
        name: deptName,
        employeeCount: new Set(),
        totalWorkMinutes: 0,
        totalOvertimeMinutes: 0,
        workDays: 0,
      }
    }

    const attendances = Array.isArray(emp.daily_attendances)
      ? emp.daily_attendances
      : [emp.daily_attendances]

    attendances.forEach((da: { actual_work_minutes: number; overtime_minutes: number; status: string }) => {
      if (da) {
        deptStats[deptId].totalWorkMinutes += da.actual_work_minutes || 0
        deptStats[deptId].totalOvertimeMinutes += da.overtime_minutes || 0
        if (da.status === 'present') {
          deptStats[deptId].workDays += 1
        }
      }
    })
  })

  // 残業アラート対象者を集計
  const alertEmployees = overtimeAlerts
    ?.map((emp) => {
      const attendances = emp.daily_attendances as { overtime_minutes: number }[] | null
      const totalOvertime = attendances?.reduce((sum, da) => sum + (da.overtime_minutes || 0), 0) || 0
      return {
        ...emp,
        totalOvertimeMinutes: totalOvertime,
      }
    })
    .filter((emp) => emp.totalOvertimeMinutes >= 2700) // 45時間以上
    .sort((a, b) => b.totalOvertimeMinutes - a.totalOvertimeMinutes)
    .slice(0, 10)

  // 全体サマリ集計
  const totalSummary = {
    totalWorkMinutes: allAttendances?.reduce((sum, a) => sum + (a.actual_work_minutes || 0), 0) || 0,
    totalOvertimeMinutes: allAttendances?.reduce((sum, a) => sum + (a.overtime_minutes || 0), 0) || 0,
    workDays: allAttendances?.filter((a) => a.status === 'present').length || 0,
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>レポート</h1>
        <MonthSelector currentMonth={targetMonth} basePath="/admin/reports" />
      </div>

      {/* 全体サマリ */}
      <Card className={styles.summaryCard}>
        <CardHeader>
          <CardTitle>{year}年{month}月 全体サマリ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.summaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>有効社員数</span>
              <span className={styles.summaryValue}>{activeEmployeeCount || 0}名</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>総出勤回数</span>
              <span className={styles.summaryValue}>{totalSummary.workDays}回</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>総労働時間</span>
              <span className={styles.summaryValue}>
                {minutesToHoursMinutes(totalSummary.totalWorkMinutes)}
              </span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLabel}>総残業時間</span>
              <span className={styles.summaryValue}>
                {minutesToHoursMinutes(totalSummary.totalOvertimeMinutes)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className={styles.grid}>
        {/* 部門別サマリ */}
        <Card>
          <CardHeader>
            <CardTitle>部門別サマリ</CardTitle>
          </CardHeader>
          <CardContent>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>部門</th>
                  <th>出勤回数</th>
                  <th>総労働時間</th>
                  <th>総残業時間</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(deptStats).map(([id, stats]) => (
                  <tr key={id}>
                    <td>{stats.name}</td>
                    <td>{stats.workDays}回</td>
                    <td>{minutesToHoursMinutes(stats.totalWorkMinutes)}</td>
                    <td>{minutesToHoursMinutes(stats.totalOvertimeMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {Object.keys(deptStats).length === 0 && (
              <p className={styles.empty}>データがありません</p>
            )}
          </CardContent>
        </Card>

        {/* 残業アラート */}
        <Card>
          <CardHeader>
            <CardTitle>残業アラート（45時間以上）</CardTitle>
          </CardHeader>
          <CardContent>
            {alertEmployees && alertEmployees.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>社員番号</th>
                    <th>氏名</th>
                    <th>部門</th>
                    <th>残業時間</th>
                  </tr>
                </thead>
                <tbody>
                  {alertEmployees.map((emp) => (
                    <tr key={emp.id} className={styles.alertRow}>
                      <td>{emp.employee_number}</td>
                      <td>{emp.name}</td>
                      <td>{(Array.isArray(emp.departments) ? emp.departments[0]?.name : (emp.departments as { name: string } | null)?.name) || '-'}</td>
                      <td className={styles.alertValue}>
                        {minutesToHoursMinutes(emp.totalOvertimeMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={styles.noAlert}>アラート対象者はいません</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
