-- RLSポリシーの無限再帰と日次勤怠トリガーの型エラーを修正

-- ヘルパー関数: 現在のユーザーの社員IDを取得（RLSを経由しない）
CREATE OR REPLACE FUNCTION current_employee_id()
RETURNS UUID AS $$
  SELECT id FROM employees WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- ヘルパー関数: 現在のユーザーの部門IDを取得（RLSを経由しない）
CREATE OR REPLACE FUNCTION current_department_id()
RETURNS UUID AS $$
  SELECT department_id FROM employees WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- employees: ポリシー内で employees を直接参照していたため無限再帰になっていた
DROP POLICY IF EXISTS "employees_select_own" ON employees;
CREATE POLICY "employees_select_own" ON employees
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_admin()
    OR is_manager_of(id)
    -- 同じ部門のメンバーも参照可能（マネージャー以上）
    OR (is_manager_or_above() AND department_id = current_department_id())
  );

-- 他テーブルのポリシーもサブクエリをヘルパー関数に置き換え
DROP POLICY IF EXISTS "attendance_records_select" ON attendance_records;
CREATE POLICY "attendance_records_select" ON attendance_records
  FOR SELECT USING (
    employee_id = current_employee_id()
    OR is_admin()
    OR is_manager_of(employee_id)
  );

DROP POLICY IF EXISTS "attendance_records_insert_own" ON attendance_records;
CREATE POLICY "attendance_records_insert_own" ON attendance_records
  FOR INSERT WITH CHECK (
    employee_id = current_employee_id()
  );

DROP POLICY IF EXISTS "daily_attendances_select" ON daily_attendances;
CREATE POLICY "daily_attendances_select" ON daily_attendances
  FOR SELECT USING (
    employee_id = current_employee_id()
    OR is_admin()
    OR is_manager_of(employee_id)
  );

DROP POLICY IF EXISTS "daily_attendances_insert" ON daily_attendances;
CREATE POLICY "daily_attendances_insert" ON daily_attendances
  FOR INSERT WITH CHECK (
    employee_id = current_employee_id()
    OR is_admin()
  );

DROP POLICY IF EXISTS "daily_attendances_update" ON daily_attendances;
CREATE POLICY "daily_attendances_update" ON daily_attendances
  FOR UPDATE USING (
    employee_id = current_employee_id()
    OR is_admin()
  );

DROP POLICY IF EXISTS "requests_select" ON requests;
CREATE POLICY "requests_select" ON requests
  FOR SELECT USING (
    employee_id = current_employee_id()
    OR is_admin()
    OR is_manager_of(employee_id)
  );

DROP POLICY IF EXISTS "requests_insert_own" ON requests;
CREATE POLICY "requests_insert_own" ON requests
  FOR INSERT WITH CHECK (
    employee_id = current_employee_id()
  );

DROP POLICY IF EXISTS "requests_update" ON requests;
CREATE POLICY "requests_update" ON requests
  FOR UPDATE USING (
    -- 本人は取り下げのみ可能（pending状態の場合）
    (employee_id = current_employee_id() AND status = 'pending')
    OR is_admin()
    OR is_manager_of(employee_id)
  );

DROP POLICY IF EXISTS "approvals_select" ON approvals;
CREATE POLICY "approvals_select" ON approvals
  FOR SELECT USING (
    request_id IN (
      SELECT id FROM requests
      WHERE employee_id = current_employee_id()
    )
    OR approver_id = current_employee_id()
    OR is_admin()
  );

DROP POLICY IF EXISTS "approvals_insert" ON approvals;
CREATE POLICY "approvals_insert" ON approvals
  FOR INSERT WITH CHECK (
    approver_id = current_employee_id()
    OR is_admin()
  );

DROP POLICY IF EXISTS "leave_balances_select" ON leave_balances;
CREATE POLICY "leave_balances_select" ON leave_balances
  FOR SELECT USING (
    employee_id = current_employee_id()
    OR is_admin()
    OR is_manager_of(employee_id)
  );

-- 日次勤怠の集計: status 列（daily_status 型）へ text を代入していたため打刻時にエラーになっていた
CREATE OR REPLACE FUNCTION calculate_daily_attendance(
  p_employee_id UUID,
  p_work_date DATE
)
RETURNS void AS $$
DECLARE
  v_clock_in TIMESTAMPTZ;
  v_clock_out TIMESTAMPTZ;
  v_break_start TIMESTAMPTZ;
  v_break_end TIMESTAMPTZ;
  v_break_minutes INTEGER := 0;
  v_work_minutes INTEGER := 0;
  v_overtime_minutes INTEGER := 0;
  v_late_night_minutes INTEGER := 0;
  v_standard_work_minutes INTEGER := 480; -- 8時間
BEGIN
  -- 当日の打刻記録を取得
  SELECT recorded_at INTO v_clock_in
  FROM attendance_records
  WHERE employee_id = p_employee_id
    AND DATE(recorded_at AT TIME ZONE 'Asia/Tokyo') = p_work_date
    AND attendance_type = 'clock_in'
  ORDER BY recorded_at ASC
  LIMIT 1;

  SELECT recorded_at INTO v_clock_out
  FROM attendance_records
  WHERE employee_id = p_employee_id
    AND DATE(recorded_at AT TIME ZONE 'Asia/Tokyo') = p_work_date
    AND attendance_type = 'clock_out'
  ORDER BY recorded_at DESC
  LIMIT 1;

  -- 休憩時間の計算（複数回の休憩に対応）
  SELECT COALESCE(SUM(
    EXTRACT(EPOCH FROM (
      COALESCE(be.recorded_at, NOW()) - bs.recorded_at
    )) / 60
  ), 0)::INTEGER INTO v_break_minutes
  FROM attendance_records bs
  LEFT JOIN LATERAL (
    SELECT recorded_at
    FROM attendance_records
    WHERE employee_id = p_employee_id
      AND DATE(recorded_at AT TIME ZONE 'Asia/Tokyo') = p_work_date
      AND attendance_type = 'break_end'
      AND recorded_at > bs.recorded_at
    ORDER BY recorded_at ASC
    LIMIT 1
  ) be ON true
  WHERE bs.employee_id = p_employee_id
    AND DATE(bs.recorded_at AT TIME ZONE 'Asia/Tokyo') = p_work_date
    AND bs.attendance_type = 'break_start';

  -- 実働時間の計算
  IF v_clock_in IS NOT NULL AND v_clock_out IS NOT NULL THEN
    v_work_minutes := GREATEST(0,
      (EXTRACT(EPOCH FROM (v_clock_out - v_clock_in)) / 60)::INTEGER - v_break_minutes
    );

    -- 残業時間の計算
    v_overtime_minutes := GREATEST(0, v_work_minutes - v_standard_work_minutes);

    -- 深夜時間の計算（22:00-05:00）
    -- 簡易計算：退勤が22時以降の場合
    IF EXTRACT(HOUR FROM v_clock_out AT TIME ZONE 'Asia/Tokyo') >= 22 THEN
      v_late_night_minutes := LEAST(
        v_work_minutes,
        (EXTRACT(EPOCH FROM (v_clock_out - (p_work_date + INTERVAL '22 hours'))) / 60)::INTEGER
      );
    END IF;
  END IF;

  -- daily_attendancesにUPSERT
  INSERT INTO daily_attendances (
    employee_id, work_date, clock_in, clock_out,
    break_minutes, actual_work_minutes, overtime_minutes, late_night_minutes,
    status
  ) VALUES (
    p_employee_id, p_work_date, v_clock_in, v_clock_out,
    v_break_minutes, v_work_minutes, v_overtime_minutes, v_late_night_minutes,
    (CASE
      WHEN v_clock_in IS NOT NULL THEN 'present'
      ELSE 'absent'
    END)::daily_status
  )
  ON CONFLICT (employee_id, work_date)
  DO UPDATE SET
    clock_in = EXCLUDED.clock_in,
    clock_out = EXCLUDED.clock_out,
    break_minutes = EXCLUDED.break_minutes,
    actual_work_minutes = EXCLUDED.actual_work_minutes,
    overtime_minutes = EXCLUDED.overtime_minutes,
    late_night_minutes = EXCLUDED.late_night_minutes,
    status = EXCLUDED.status,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
