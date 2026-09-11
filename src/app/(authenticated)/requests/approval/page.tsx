import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { formatDate } from '@/lib/utils'
import { ApprovalActions } from './approval-actions'
import styles from './page.module.css'

export default async function ApprovalPage() {
  const currentEmployee = await requireRole('admin', 'manager')
  const supabase = await createClient()

  // 承認待ちの申請を取得（管理者は全件、マネージャーは部下の申請のみ。自分の申請は除く）
  let query = supabase
    .from('requests')
    .select(`
      *,
      employees!requests_employee_id_fkey(
        id,
        name,
        employee_number,
        departments(name)
      )
    `)
    .eq('status', 'pending')
    .neq('employee_id', currentEmployee.id)
    .order('created_at', { ascending: false })

  if (currentEmployee.role === 'manager') {
    // マネージャーの場合、部下の申請のみ
    const { data: subordinates } = await supabase
      .from('employees')
      .select('id')
      .eq('manager_id', currentEmployee.id)

    const subordinateIds = subordinates?.map((s) => s.id) || []
    if (subordinateIds.length > 0) {
      query = query.in('employee_id', subordinateIds)
    } else {
      // 部下がいない場合は空の結果を返す
      query = query.eq('employee_id', 'no-match')
    }
  }

  const { data: pendingRequests } = await query

  const typeLabels: Record<string, string> = {
    overtime: '残業申請',
    holiday_work: '休日出勤申請',
    leave: '休暇申請',
    attendance_correction: '勤怠修正申請',
  }

  const leaveTypeLabels: Record<string, string> = {
    paid: '有給休暇',
    substitute: '代休',
    sick: '病欠',
    special: '特別休暇',
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>承認待ち一覧</h1>

      {pendingRequests && pendingRequests.length > 0 ? (
        <div className={styles.list}>
          {pendingRequests.map((req) => (
            <Card key={req.id} className={styles.card}>
              <CardHeader>
                <div className={styles.cardHeader}>
                  <CardTitle>{typeLabels[req.request_type]}</CardTitle>
                  <span className={styles.date}>
                    申請日: {formatDate(req.request_date)}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <div className={styles.info}>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>申請者</span>
                    <span className={styles.infoValue}>
                      {req.employees?.name} ({req.employees?.employee_number})
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>部門</span>
                    <span className={styles.infoValue}>
                      {req.employees?.departments?.name || '-'}
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>対象期間</span>
                    <span className={styles.infoValue}>
                      {formatDate(req.start_date)}
                      {req.start_date !== req.end_date &&
                        ` 〜 ${formatDate(req.end_date)}`}
                    </span>
                  </div>
                  {req.request_type === 'leave' && req.leave_type && (
                    <div className={styles.infoRow}>
                      <span className={styles.infoLabel}>休暇種別</span>
                      <span className={styles.infoValue}>
                        {leaveTypeLabels[req.leave_type]}
                      </span>
                    </div>
                  )}
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>理由</span>
                    <span className={styles.infoValue}>{req.reason}</span>
                  </div>
                </div>

                <ApprovalActions requestId={req.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent>
            <p className={styles.empty}>承認待ちの申請はありません</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
