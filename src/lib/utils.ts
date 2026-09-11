import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { tz } from '@date-fns/tz'

// 勤怠の日付・時刻はすべて日本時間で扱う（サーバー・ブラウザのタイムゾーンに依存しない）
export const APP_TIME_ZONE = 'Asia/Tokyo'
const inAppTimeZone = tz(APP_TIME_ZONE)

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function toDate(date: string | Date): Date {
  if (typeof date !== 'string') return date
  // 'YYYY-MM-DD' は日本時間の 0 時として解釈する
  return DATE_ONLY_PATTERN.test(date) ? parseISO(date, { in: inAppTimeZone }) : parseISO(date)
}

export function formatDate(date: string | Date, formatStr: string = 'yyyy/MM/dd'): string {
  return format(toDate(date), formatStr, { locale: ja, in: inAppTimeZone })
}

export function formatTime(date: string | Date): string {
  return formatDate(date, 'HH:mm')
}

export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'yyyy/MM/dd HH:mm')
}

/** 日本時間での今日の日付（'YYYY-MM-DD'） */
export function getTodayString(now: Date = new Date()): string {
  return formatDate(now, 'yyyy-MM-dd')
}

/** 'YYYY-MM-DD' に日数を加算 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/** 年月日から 'YYYY-MM-DD' を組み立てる */
export function toDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** 指定月の日数 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** 'YYYY-MM-DD' の曜日（0: 日曜） */
export function getDayOfWeek(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

export function minutesToHoursMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${hours}:${mins.toString().padStart(2, '0')}`
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
