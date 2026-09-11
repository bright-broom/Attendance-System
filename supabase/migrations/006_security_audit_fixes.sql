-- セキュリティ監査の指摘対応
-- ・無効化した社員の権限剥奪 ・申請の改ざん / 自己承認の防止（承認は decide_request に一本化）
-- ・監査ログ ・勤怠データの保存（物理削除の禁止） ・整合性制約 ・過剰な権限の削除

-- ========================================
-- 1. 権限ヘルパー: 無効化された社員は権限なし
-- ========================================
CREATE OR REPLACE FUNCTION current_employee_id()
RETURNS UUID AS $$
  SELECT id FROM employees WHERE user_id = auth.uid() AND is_active LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION current_department_id()
RETURNS UUID AS $$
  SELECT department_id FROM employees WHERE user_id = auth.uid() AND is_active LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION get_current_employee()
RETURNS employees AS $$
  SELECT * FROM employees WHERE user_id = auth.uid() AND is_active LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees
    WHERE user_id = auth.uid() AND role = 'admin' AND is_active
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION is_manager_or_above()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees
    WHERE user_id = auth.uid() AND role IN ('admin', 'manager') AND is_active
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

-- 上長は「有効」かつ「マネージャー以上」で、本人以外
CREATE OR REPLACE FUNCTION is_manager_of(target_employee_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM employees target
    JOIN employees manager ON target.manager_id = manager.id
    WHERE target.id = target_employee_id
      AND manager.user_id = auth.uid()
      AND manager.is_active
      AND manager.role IN ('admin', 'manager')
      AND target.id <> manager.id
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp;

ALTER FUNCTION update_updated_at_column() SET search_path = public, pg_temp;

-- ========================================
-- 2. 上長設定: 自分自身・循環を禁止
-- ========================================
ALTER TABLE employees
  ADD CONSTRAINT employees_manager_not_self CHECK (manager_id IS NULL OR manager_id <> id);

CREATE OR REPLACE FUNCTION prevent_manager_cycle()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.manager_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    WITH RECURSIVE chain(id) AS (
      SELECT NEW.manager_id
      UNION
      SELECT e.manager_id FROM employees e JOIN chain c ON e.id = c.id WHERE e.manager_id IS NOT NULL
    )
    SELECT 1 FROM chain WHERE id = NEW.id
  ) THEN
    RAISE EXCEPTION '上長の設定が循環しています' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER employees_prevent_manager_cycle
  BEFORE INSERT OR UPDATE OF manager_id ON employees
  FOR EACH ROW EXECUTE FUNCTION prevent_manager_cycle();

-- ========================================
-- 3. 申請の承認: DB 関数で 1 トランザクションに（直接の UPDATE / 承認記録の INSERT は禁止）
-- ========================================
CREATE OR REPLACE FUNCTION decide_request(
  p_request_id UUID,
  p_action approval_action,
  p_comment TEXT DEFAULT NULL
)
RETURNS request_status AS $$
DECLARE
  v_approver_id UUID := current_employee_id();
  v_request requests%ROWTYPE;
  v_new_status request_status;
BEGIN
  IF v_approver_id IS NULL THEN
    RAISE EXCEPTION 'この操作を行う権限がありません';
  END IF;

  -- 同時に処理されないよう行ロック
  SELECT * INTO v_request FROM requests WHERE id = p_request_id FOR UPDATE;

  -- 存在しない申請と権限のない申請は区別しない（ID の探索を防ぐ）
  IF NOT FOUND OR NOT (is_admin() OR is_manager_of(v_request.employee_id)) THEN
    RAISE EXCEPTION 'この操作を行う権限がありません';
  END IF;
  IF v_request.employee_id = v_approver_id THEN
    RAISE EXCEPTION '自分の申請は処理できません';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'この申請は既に処理されています';
  END IF;
  IF p_comment IS NOT NULL AND char_length(p_comment) > 200 THEN
    RAISE EXCEPTION 'コメントは200文字以内で入力してください';
  END IF;

  -- 差し戻しは承認記録（コメント）を残し、申請は承認待ちのまま
  v_new_status := CASE p_action
    WHEN 'approved' THEN 'approved'::request_status
    WHEN 'rejected' THEN 'rejected'::request_status
    ELSE 'pending'::request_status
  END;

  INSERT INTO approvals (request_id, approver_id, action, comment)
  VALUES (p_request_id, v_approver_id, p_action, NULLIF(p_comment, ''));

  UPDATE requests SET status = v_new_status WHERE id = p_request_id;

  RETURN v_new_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION decide_request(UUID, approval_action, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION decide_request(UUID, approval_action, TEXT) TO authenticated;

-- 承認記録は decide_request 経由でのみ作成
DROP POLICY IF EXISTS "approvals_insert" ON approvals;

-- 申請の UPDATE は「本人による取り下げ」のみ（承認・却下は decide_request）
DROP POLICY IF EXISTS "requests_update" ON requests;
CREATE POLICY "requests_withdraw_own" ON requests
  FOR UPDATE TO authenticated
  USING (employee_id = current_employee_id() AND status = 'pending')
  WITH CHECK (employee_id = current_employee_id() AND status = 'withdrawn');

REVOKE UPDATE ON requests FROM anon, authenticated;
GRANT UPDATE (status) ON requests TO authenticated;

-- 申請の作成: 勤怠修正の対象は自分の勤怠のみ
DROP POLICY IF EXISTS "requests_insert_own" ON requests;
CREATE POLICY "requests_insert_own" ON requests
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = current_employee_id()
    AND status = 'pending'
    AND (
      target_attendance_id IS NULL
      OR EXISTS (
        SELECT 1 FROM daily_attendances d
        WHERE d.id = target_attendance_id AND d.employee_id = requests.employee_id
      )
    )
  );

-- ========================================
-- 4. 列単位の更新権限（主キー・紐付けの付け替えを禁止）
-- ========================================
-- 社員: user_id（ログインアカウントとの紐付け）は変更不可
REVOKE UPDATE ON employees FROM anon, authenticated;
GRANT UPDATE (employee_number, name, email, department_id, role, employment_type, manager_id, hire_date, is_active)
  ON employees TO authenticated;

-- 打刻（管理者の修正）: 対象社員は変更不可。修正時は日次勤怠を再集計する
REVOKE UPDATE ON attendance_records FROM anon, authenticated;
GRANT UPDATE (attendance_type, recorded_at, note) ON attendance_records TO authenticated;

CREATE OR REPLACE FUNCTION trigger_recalculate_daily_attendance()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM calculate_daily_attendance(OLD.employee_id, DATE(OLD.recorded_at AT TIME ZONE 'Asia/Tokyo'));
  IF DATE(NEW.recorded_at AT TIME ZONE 'Asia/Tokyo') <> DATE(OLD.recorded_at AT TIME ZONE 'Asia/Tokyo') THEN
    PERFORM calculate_daily_attendance(NEW.employee_id, DATE(NEW.recorded_at AT TIME ZONE 'Asia/Tokyo'));
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER attendance_record_after_update
  AFTER UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION trigger_recalculate_daily_attendance();

-- ========================================
-- 5. 勤怠データの保存: 社員削除による連鎖削除を禁止（退職は is_active = false で運用）
-- ========================================
ALTER TABLE attendance_records
  DROP CONSTRAINT attendance_records_employee_id_fkey,
  ADD CONSTRAINT attendance_records_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE daily_attendances
  DROP CONSTRAINT daily_attendances_employee_id_fkey,
  ADD CONSTRAINT daily_attendances_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE requests
  DROP CONSTRAINT requests_employee_id_fkey,
  ADD CONSTRAINT requests_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE leave_balances
  DROP CONSTRAINT leave_balances_employee_id_fkey,
  ADD CONSTRAINT leave_balances_employee_id_fkey
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
ALTER TABLE employees
  DROP CONSTRAINT employees_user_id_fkey,
  ADD CONSTRAINT employees_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;

DROP POLICY IF EXISTS "employees_delete_admin" ON employees;

-- ========================================
-- 6. 整合性制約
-- ========================================
ALTER TABLE requests
  ADD CONSTRAINT requests_date_order CHECK (end_date >= start_date),
  ADD CONSTRAINT requests_leave_type_required CHECK ((request_type = 'leave') = (leave_type IS NOT NULL)),
  ADD CONSTRAINT requests_reason_length CHECK (char_length(reason) BETWEEN 1 AND 1000),
  ADD CONSTRAINT requests_correction_data_size CHECK (correction_data IS NULL OR pg_column_size(correction_data) <= 8192);

ALTER TABLE daily_attendances
  ADD CONSTRAINT daily_attendances_minutes_non_negative CHECK (
    break_minutes >= 0 AND actual_work_minutes >= 0 AND overtime_minutes >= 0 AND late_night_minutes >= 0
  );

ALTER TABLE leave_balances
  ADD CONSTRAINT leave_balances_days_valid CHECK (
    granted_days >= 0 AND used_days >= 0 AND remaining_days = granted_days - used_days
  );

ALTER TABLE attendance_records
  ADD CONSTRAINT attendance_records_location_valid CHECK (
    (latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
  ),
  ADD CONSTRAINT attendance_records_note_length CHECK (note IS NULL OR char_length(note) <= 500);

ALTER TABLE approvals
  ADD CONSTRAINT approvals_comment_length CHECK (comment IS NULL OR char_length(comment) <= 200);

-- ========================================
-- 7. 監査ログ（重要な変更を DB 側で自動記録）
-- ========================================
CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER audit_employees
  AFTER INSERT OR UPDATE OR DELETE ON employees
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_departments
  AFTER INSERT OR UPDATE OR DELETE ON departments
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_requests
  AFTER UPDATE OR DELETE ON requests
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_approvals
  AFTER INSERT ON approvals
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_leave_balances
  AFTER INSERT OR UPDATE OR DELETE ON leave_balances
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();
CREATE TRIGGER audit_attendance_records
  AFTER UPDATE OR DELETE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

-- ========================================
-- 8. 過剰な権限の削除
-- ========================================
-- 未ログイン（anon）はアプリのデータに一切アクセスしない（GraphQL / OpenAPI からのスキーマ露出も防ぐ）
DROP POLICY IF EXISTS "departments_select_all" ON departments;
CREATE POLICY "departments_select_authenticated" ON departments
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;

-- RLS を迂回できる TRUNCATE などは不要
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM authenticated;

-- 内部専用の関数はログインユーザーからも直接呼べないようにする
-- （RLS ポリシーから呼ぶヘルパー関数は authenticated の実行権限が必要なので残す）
REVOKE EXECUTE ON FUNCTION
  calculate_daily_attendance(UUID, DATE),
  trigger_update_daily_attendance(),
  trigger_recalculate_daily_attendance(),
  validate_attendance_record(),
  set_request_date(),
  prevent_manager_cycle(),
  audit_row_change(),
  update_updated_at_column()
FROM authenticated;
