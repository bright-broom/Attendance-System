'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createEmployee } from './actions'
import styles from './page.module.css'

export default function NewEmployeePage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([])
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    employee_number: '',
    name: '',
    department_id: '',
    role: 'employee',
    employment_type: 'full_time',
    manager_id: '',
    hire_date: '',
  })

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const [deptRes, empRes] = await Promise.all([
        supabase.from('departments').select('id, name').order('name'),
        supabase.from('employees').select('id, name').eq('is_active', true).order('name'),
      ])
      setDepartments(deptRes.data || [])
      setEmployees(empRes.data || [])
    }
    fetchData()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    // 認証ユーザーの作成と社員登録はサーバー側で行う
    try {
      const { error: createError } = await createEmployee(formData)
      if (createError) {
        setError(createError)
        setIsLoading(false)
        return
      }
    } catch {
      setError('社員登録中にエラーが発生しました')
      setIsLoading(false)
      return
    }

    router.push('/admin/employees')
    router.refresh()
  }

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>社員登録</h1>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>アカウント情報</h2>
              <div className={styles.grid}>
                <Input
                  id="email"
                  type="email"
                  label="メールアドレス"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  required
                />
                <Input
                  id="password"
                  type="password"
                  label="初期パスワード"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  required
                  minLength={12}
                />
              </div>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>基本情報</h2>
              <div className={styles.grid}>
                <Input
                  id="employee_number"
                  label="社員番号"
                  value={formData.employee_number}
                  onChange={(e) =>
                    setFormData({ ...formData, employee_number: e.target.value })
                  }
                  required
                />
                <Input
                  id="name"
                  label="氏名"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  required
                />
                <div className={styles.field}>
                  <label htmlFor="department_id" className={styles.label}>
                    部門
                  </label>
                  <select
                    id="department_id"
                    className={styles.select}
                    value={formData.department_id}
                    onChange={(e) =>
                      setFormData({ ...formData, department_id: e.target.value })
                    }
                  >
                    <option value="">選択してください</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="role" className={styles.label}>
                    権限
                  </label>
                  <select
                    id="role"
                    className={styles.select}
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value })
                    }
                    required
                  >
                    <option value="employee">一般社員</option>
                    <option value="manager">マネージャー</option>
                    <option value="admin">管理者</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="employment_type" className={styles.label}>
                    雇用区分
                  </label>
                  <select
                    id="employment_type"
                    className={styles.select}
                    value={formData.employment_type}
                    onChange={(e) =>
                      setFormData({ ...formData, employment_type: e.target.value })
                    }
                    required
                  >
                    <option value="full_time">正社員</option>
                    <option value="part_time">パート</option>
                    <option value="contract">契約社員</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="manager_id" className={styles.label}>
                    上長
                  </label>
                  <select
                    id="manager_id"
                    className={styles.select}
                    value={formData.manager_id}
                    onChange={(e) =>
                      setFormData({ ...formData, manager_id: e.target.value })
                    }
                  >
                    <option value="">選択してください</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  id="hire_date"
                  type="date"
                  label="入社日"
                  value={formData.hire_date}
                  onChange={(e) =>
                    setFormData({ ...formData, hire_date: e.target.value })
                  }
                  required
                />
              </div>
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
                登録する
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
