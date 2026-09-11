import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import styles from './page.module.css'

export default async function EmployeesPage() {
  await requireRole('admin')
  const supabase = await createClient()

  // 社員一覧を取得
  const { data: employees } = await supabase
    .from('employees')
    .select(`
      id,
      employee_number,
      name,
      email,
      role,
      employment_type,
      hire_date,
      is_active,
      departments(name)
    `)
    .order('employee_number', { ascending: true })

  const roleLabels: Record<string, string> = {
    admin: '管理者',
    manager: 'マネージャー',
    employee: '一般社員',
  }

  const employmentTypeLabels: Record<string, string> = {
    full_time: '正社員',
    part_time: 'パート',
    contract: '契約社員',
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>社員管理</h1>
        <Link href="/admin/employees/new">
          <Button>新規登録</Button>
        </Link>
      </div>

      <Card>
        <CardContent className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>社員番号</th>
                <th>氏名</th>
                <th>メールアドレス</th>
                <th>部門</th>
                <th>役職</th>
                <th>雇用区分</th>
                <th>入社日</th>
                <th>ステータス</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees?.map((emp) => (
                <tr key={emp.id}>
                  <td>{emp.employee_number}</td>
                  <td>{emp.name}</td>
                  <td>{emp.email}</td>
                  <td>{emp.departments?.name || '-'}</td>
                  <td>{roleLabels[emp.role]}</td>
                  <td>{employmentTypeLabels[emp.employment_type]}</td>
                  <td>{formatDate(emp.hire_date)}</td>
                  <td>
                    <span
                      className={`${styles.status} ${
                        emp.is_active ? styles.active : styles.inactive
                      }`}
                    >
                      {emp.is_active ? '有効' : '無効'}
                    </span>
                  </td>
                  <td>
                    <Link href={`/admin/employees/${emp.id}`}>
                      <Button variant="ghost" size="sm">
                        編集
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(!employees || employees.length === 0) && (
            <p className={styles.empty}>社員が登録されていません</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
