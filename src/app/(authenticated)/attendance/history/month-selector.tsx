'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getTodayString } from '@/lib/utils'
import styles from './month-selector.module.css'

interface MonthSelectorProps {
  currentMonth: string
  /** 月を切り替えたときの遷移先 */
  basePath?: string
}

export function MonthSelector({ currentMonth, basePath = '/attendance/history' }: MonthSelectorProps) {
  const router = useRouter()
  const [year, month] = currentMonth.split('-').map(Number)

  const goToMonth = (targetYear: number, targetMonth: number) => {
    router.push(`${basePath}?month=${targetYear}-${String(targetMonth).padStart(2, '0')}`)
  }

  const goToPrevMonth = () => {
    goToMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)
  }

  const goToNextMonth = () => {
    goToMonth(month === 12 ? year + 1 : year, month === 12 ? 1 : month + 1)
  }

  const goToCurrentMonth = () => {
    // 日本時間の今月
    const [currentYear, currentMonthNumber] = getTodayString().split('-').map(Number)
    goToMonth(currentYear, currentMonthNumber)
  }

  return (
    <div className={styles.selector}>
      <Button variant="ghost" size="sm" onClick={goToPrevMonth}>
        ←
      </Button>
      <span className={styles.current}>
        {year}年{month}月
      </span>
      <Button variant="ghost" size="sm" onClick={goToNextMonth}>
        →
      </Button>
      <Button variant="secondary" size="sm" onClick={goToCurrentMonth}>
        今月
      </Button>
    </div>
  )
}
