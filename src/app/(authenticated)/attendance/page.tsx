import { createClient } from '@/lib/supabase/server'
import { requireEmployee } from '@/lib/auth'
import { addDaysToDateString, getTodayString } from '@/lib/utils'
import { AttendanceClient } from './attendance-client'

export default async function AttendancePage() {
  const employee = await requireEmployee()
  const supabase = await createClient()

  // 今日（日本時間 0:00〜翌 0:00）の打刻記録を取得
  const today = getTodayString()
  const tomorrow = addDaysToDateString(today, 1)
  const { data: records } = await supabase
    .from('attendance_records')
    .select('id, attendance_type, recorded_at')
    .eq('employee_id', employee.id)
    .gte('recorded_at', `${today}T00:00:00+09:00`)
    .lt('recorded_at', `${tomorrow}T00:00:00+09:00`)
    .order('recorded_at', { ascending: true })

  return (
    <AttendanceClient
      initialEmployee={{ id: employee.id, name: employee.name }}
      initialRecords={records || []}
    />
  )
}
