import type { ReactNode } from 'react'
import { requireEmployee } from '@/lib/auth'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import styles from './layout.module.css'

export default async function AuthenticatedLayout({
  children,
}: {
  children: ReactNode
}) {
  const employee = await requireEmployee()

  // クライアントコンポーネントには表示に必要な項目だけ渡す
  const viewer = {
    id: employee.id,
    name: employee.name,
    role: employee.role,
    department_name: employee.departmentName,
  }

  return (
    <div className={styles.layout}>
      <Sidebar employee={viewer} />
      <div className={styles.main}>
        <Header employee={viewer} />
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  )
}
