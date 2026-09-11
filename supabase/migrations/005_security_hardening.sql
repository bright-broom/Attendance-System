-- セキュリティ強化: 未ログインでのデータ参照・社員によるデータ改ざん・日付ずれの修正

-- ========================================
-- SECURITY DEFINER 関数の search_path を固定
-- ========================================
ALTER FUNCTION get_current_employee() SET search_path = public, pg_temp;
ALTER FUNCTION is_admin() SET search_path = public, pg_temp;
ALTER FUNCTION is_manager_or_above() SET search_path = public, pg_temp;
ALTER FUNCTION is_manager_of(UUID) SET search_path = public, pg_temp;

-- ========================================
-- 集計ビュー: 呼び出し元の権限（RLS）で実行する
-- ========================================
ALTER VIEW monthly_attendance_summary SET (security_invoker = true);
ALTER VIEW department_monthly_summary SET (security_invoker = true);
REVOKE ALL ON monthly_attendance_summary FROM anon;
REVOKE ALL ON department_monthly_summary FROM anon;

-- ========================================
-- 日次勤怠の集計関数
-- ・内部専用（打刻トリガーからのみ呼ぶ）にして RPC から実行不可にする
-- ・深夜時間を JST の 0:00〜5:00 / 22:00〜翌5:00 との重なりで計算する
-- ========================================
CREATE OR REPLACE FUNCTION calculate_daily_attendance(
  p_employee_id UUID,
  p_work_date DATE
)
RETURNS void AS $$
DECLARE
  v_clock_in TIMESTAMPTZ;
  v_clock_out TIMESTAMPTZ;
  v_break_minutes INTEGER := 0;
  v_work_minutes INTEGER := 0;
  v_overtime_minutes INTEGER := 0;
  v_late_night_minutes INTEGER := 0;
  v_standard_work_minutes INTEGER := 480; -- 8時間
  v_day_start TIMESTAMPTZ := p_work_date::TIMESTAMP AT TIME ZONE 'Asia/Tokyo';
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

    -- 深夜時間の計算（JST 0:00-5:00 と 22:00-翌5:00 の勤務との重なり）
    v_late_night_minutes := LEAST(
      v_work_minutes,
      GREATEST(0, EXTRACT(EPOCH FROM (
        LEAST(v_clock_out, v_day_start + INTERVAL '5 hours')
        - GREATEST(v_clock_in, v_day_start)
      )) / 60)::INTEGER
      + GREATEST(0, EXTRACT(EPOCH FROM (
        LEAST(v_clock_out, v_day_start + INTERVAL '29 hours')
        - GREATEST(v_clock_in, v_day_start + INTERVAL '22 hours')
      )) / 60)::INTEGER
    );
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION calculate_daily_attendance(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- 打刻トリガーは所有者権限で集計関数を呼ぶ（呼び出し元に EXECUTE 権限が不要になる）
CREATE OR REPLACE FUNCTION trigger_update_daily_attendance()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM calculate_daily_attendance(
    NEW.employee_id,
    DATE(NEW.recorded_at AT TIME ZONE 'Asia/Tokyo')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ========================================
-- アラート取得関数: 管理者のみ実行可能にする
-- ========================================
CREATE OR REPLACE FUNCTION get_overtime_alert_employees(
  p_month DATE,
  p_threshold_minutes INTEGER DEFAULT 2700 -- 45時間 = 2700分
)
RETURNS TABLE (
  employee_id UUID,
  employee_name VARCHAR,
  department_name VARCHAR,
  total_overtime_minutes INTEGER
) AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    d.name,
    COALESCE(SUM(da.overtime_minutes), 0)::INTEGER
  FROM employees e
  LEFT JOIN departments d ON e.department_id = d.id
  LEFT JOIN daily_attendances da ON e.id = da.employee_id
    AND DATE_TRUNC('month', da.work_date) = DATE_TRUNC('month', p_month)
  WHERE e.is_active = true
  GROUP BY e.id, e.name, d.name
  HAVING COALESCE(SUM(da.overtime_minutes), 0) >= p_threshold_minutes
  ORDER BY COALESCE(SUM(da.overtime_minutes), 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION get_leave_alert_employees(
  p_fiscal_year INTEGER,
  p_min_usage_days DECIMAL DEFAULT 5.0
)
RETURNS TABLE (
  employee_id UUID,
  employee_name VARCHAR,
  department_name VARCHAR,
  granted_days DECIMAL,
  used_days DECIMAL,
  remaining_days DECIMAL
) AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    d.name,
    lb.granted_days,
    lb.used_days,
    lb.remaining_days
  FROM employees e
  LEFT JOIN departments d ON e.department_id = d.id
  LEFT JOIN leave_balances lb ON e.id = lb.employee_id
    AND lb.fiscal_year = p_fiscal_year
    AND lb.leave_type = 'paid'
  WHERE e.is_active = true
    AND lb.used_days < p_min_usage_days
  ORDER BY lb.used_days ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION get_overtime_alert_employees(DATE, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_leave_alert_employees(INTEGER, DECIMAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_overtime_alert_employees(DATE, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_leave_alert_employees(INTEGER, DECIMAL) TO authenticated;

-- ========================================
-- 打刻: 時刻はサーバー時刻に固定し、打刻の順序と重複をチェック
-- ========================================
CREATE OR REPLACE FUNCTION validate_attendance_record()
RETURNS TRIGGER AS $$
DECLARE
  v_today DATE;
  v_has_clock_in BOOLEAN;
  v_has_clock_out BOOLEAN;
  v_last_break attendance_type;
BEGIN
  -- service_role 等による一括投入・データ移行は対象外
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  NEW.recorded_at := NOW();
  v_today := DATE(NEW.recorded_at AT TIME ZONE 'Asia/Tokyo');

  -- 同じ社員の同時打刻を直列化
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.employee_id::TEXT, 0));

  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = NEW.employee_id AND is_active) THEN
    RAISE EXCEPTION '有効な社員ではありません' USING ERRCODE = '42501';
  END IF;

  SELECT
    COALESCE(BOOL_OR(attendance_type = 'clock_in'), false),
    COALESCE(BOOL_OR(attendance_type = 'clock_out'), false)
  INTO v_has_clock_in, v_has_clock_out
  FROM attendance_records
  WHERE employee_id = NEW.employee_id
    AND DATE(recorded_at AT TIME ZONE 'Asia/Tokyo') = v_today;

  SELECT attendance_type INTO v_last_break
  FROM attendance_records
  WHERE employee_id = NEW.employee_id
    AND DATE(recorded_at AT TIME ZONE 'Asia/Tokyo') = v_today
    AND attendance_type IN ('break_start', 'break_end')
  ORDER BY recorded_at DESC
  LIMIT 1;

  IF NEW.attendance_type = 'clock_in' AND v_has_clock_in THEN
    RAISE EXCEPTION '本日は既に出勤打刻済みです' USING ERRCODE = '23505';
  ELSIF NEW.attendance_type <> 'clock_in' AND NOT v_has_clock_in THEN
    RAISE EXCEPTION '出勤打刻がありません' USING ERRCODE = '23514';
  ELSIF NEW.attendance_type <> 'clock_in' AND v_has_clock_out THEN
    RAISE EXCEPTION '本日は既に退勤打刻済みです' USING ERRCODE = '23514';
  ELSIF NEW.attendance_type = 'break_start' AND v_last_break = 'break_start' THEN
    RAISE EXCEPTION '既に休憩中です' USING ERRCODE = '23514';
  ELSIF NEW.attendance_type = 'break_end' AND v_last_break IS DISTINCT FROM 'break_start' THEN
    RAISE EXCEPTION '休憩中ではありません' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

CREATE TRIGGER attendance_record_before_insert
  BEFORE INSERT ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION validate_attendance_record();

-- 日次勤怠は打刻トリガーが自動計算する。社員本人による直接の追加・更新は禁止
DROP POLICY IF EXISTS "daily_attendances_insert" ON daily_attendances;
CREATE POLICY "daily_attendances_insert" ON daily_attendances
  FOR INSERT WITH CHECK (is_admin());

DROP POLICY IF EXISTS "daily_attendances_update" ON daily_attendances;
CREATE POLICY "daily_attendances_update" ON daily_attendances
  FOR UPDATE USING (is_admin());

-- ========================================
-- 申請: 本人が作れるのは承認待ちの申請のみ。申請日は JST の当日に固定
-- ========================================
DROP POLICY IF EXISTS "requests_insert_own" ON requests;
CREATE POLICY "requests_insert_own" ON requests
  FOR INSERT WITH CHECK (
    employee_id = current_employee_id()
    AND status = 'pending'
  );

CREATE OR REPLACE FUNCTION set_request_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.request_date := (NOW() AT TIME ZONE 'Asia/Tokyo')::DATE;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

ALTER TABLE requests ALTER COLUMN request_date SET DEFAULT (NOW() AT TIME ZONE 'Asia/Tokyo')::DATE;

CREATE TRIGGER requests_before_insert
  BEFORE INSERT ON requests
  FOR EACH ROW EXECUTE FUNCTION set_request_date();

-- 承認記録: 管理者または申請者の上長が、自分の名義でのみ作成できる
DROP POLICY IF EXISTS "approvals_insert" ON approvals;
CREATE POLICY "approvals_insert" ON approvals
  FOR INSERT WITH CHECK (
    approver_id = current_employee_id()
    AND (
      is_admin()
      OR is_manager_of((SELECT r.employee_id FROM requests r WHERE r.id = request_id))
    )
  );

-- 監査ログ: クライアントからの書き込みを禁止（誰でも偽のログを書けていた）
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;
