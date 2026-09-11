import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/auth'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import styles from './page.module.css'

export default async function RequestsPage() {
  const employee = await requireEmployee()
  const supabase = await createClient()

  // 自分の申請一覧を取得
  const { data: requests } = await supabase
    .from('requests')
    .select('*')
    .eq('employee_id', employee.id)
    .order('created_at', { ascending: false })
    .limit(50)

  const typeLabels: Record<string, string> = {
    overtime: '残業申請',
    holiday_work: '休日出勤申請',
    leave: '休暇申請',
    attendance_correction: '勤怠修正申請',
  }

  const statusLabels: Record<string, string> = {
    pending: '承認待ち',
    approved: '承認済み',
    rejected: '却下',
    withdrawn: '取り下げ',
  }

  const leaveTypeLabels: Record<string, string> = {
    paid: '有給休暇',
    substitute: '代休',
    sick: '病欠',
    special: '特別休暇',
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>申請一覧</h1>
        <Link href="/requests/new">
          <Button>新規申請</Button>
        </Link>
      </div>

      <Card>
        <CardContent className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>申請日</th>
                <th>種別</th>
                <th>対象期間</th>
                <th>詳細</th>
                <th>ステータス</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {requests?.map((req) => (
                <tr key={req.id}>
                  <td>{formatDate(req.request_date)}</td>
                  <td>{typeLabels[req.request_type]}</td>
                  <td>
                    {formatDate(req.start_date)}
                    {req.start_date !== req.end_date && ` 〜 ${formatDate(req.end_date)}`}
                  </td>
                  <td>
                    {req.request_type === 'leave' && req.leave_type && (
                      <span className={styles.detail}>
                        {leaveTypeLabels[req.leave_type]}
                      </span>
                    )}
                    {req.reason.length > 30
                      ? `${req.reason.substring(0, 30)}...`
                      : req.reason}
                  </td>
                  <td>
                    <span className={`${styles.status} ${styles[req.status]}`}>
                      {statusLabels[req.status]}
                    </span>
                  </td>
                  <td>
                    <Link href={`/requests/${req.id}`}>
                      <Button variant="ghost" size="sm">
                        詳細
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!requests || requests.length === 0) && (
            <p className={styles.empty}>申請がありません</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
