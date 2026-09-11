/**
 * DB の型定義
 * スキーマの型は `supabase gen types typescript --local --schema public > src/types/supabase.ts`
 * で自動生成する（手で編集しない）。ここでは生成された型の別名だけを定義する。
 */
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from './supabase'

export type { Database, Enums, Tables, TablesInsert, TablesUpdate }

export type UserRole = Enums<'user_role'>
export type EmploymentType = Enums<'employment_type'>
export type AttendanceType = Enums<'attendance_type'>
export type RequestType = Enums<'request_type'>
export type RequestStatus = Enums<'request_status'>
export type LeaveType = Enums<'leave_type'>
export type DailyStatus = Enums<'daily_status'>
export type ApprovalAction = Enums<'approval_action'>
