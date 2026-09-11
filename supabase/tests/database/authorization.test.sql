-- 認可・データ保護の回帰テスト（pgTAP）
-- 実行: supabase test db
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(35);

-- ----------------------------------------
-- テスト用データ（postgres 権限で作成。最後に ROLLBACK される）
-- ----------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-00000000a001', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000a002', 'manager@test.local'),
  ('00000000-0000-0000-0000-00000000a003', 'member@test.local'),
  ('00000000-0000-0000-0000-00000000a004', 'other@test.local'),
  ('00000000-0000-0000-0000-00000000a005', 'inactive-admin@test.local');

INSERT INTO employees (id, user_id, employee_number, name, email, role, hire_date, is_active) VALUES
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000a001', 'T001', '管理者', 'admin@test.local', 'admin', '2026-04-01', true),
  ('00000000-0000-0000-0000-00000000e002', '00000000-0000-0000-0000-00000000a002', 'T002', '上長', 'manager@test.local', 'manager', '2026-04-01', true),
  ('00000000-0000-0000-0000-00000000e004', '00000000-0000-0000-0000-00000000a004', 'T004', '他部署', 'other@test.local', 'employee', '2026-04-01', true),
  ('00000000-0000-0000-0000-00000000e005', '00000000-0000-0000-0000-00000000a005', 'T005', '無効管理者', 'inactive-admin@test.local', 'admin', '2026-04-01', false);
INSERT INTO employees (id, user_id, employee_number, name, email, role, hire_date, manager_id) VALUES
  ('00000000-0000-0000-0000-00000000e003', '00000000-0000-0000-0000-00000000a003', 'T003', '部下', 'member@test.local', 'employee', '2026-04-01', '00000000-0000-0000-0000-00000000e002');

INSERT INTO requests (id, employee_id, request_type, start_date, end_date, reason) VALUES
  ('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-00000000e003', 'overtime', '2026-09-01', '2026-09-01', '部下の申請'),
  ('00000000-0000-0000-0000-0000000000b2'::uuid, '00000000-0000-0000-0000-00000000e004', 'overtime', '2026-09-01', '2026-09-01', '部下でない社員の申請'),
  ('00000000-0000-0000-0000-0000000000b3'::uuid, '00000000-0000-0000-0000-00000000e001', 'overtime', '2026-09-01', '2026-09-01', '管理者自身の申請');

-- ログインユーザーを切り替える
CREATE FUNCTION pg_temp.act_as(p_user_id UUID) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------
-- 未ログイン
-- ----------------------------------------
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM employees$$, '42501', NULL, 'anon: 社員テーブルを読めない');
SELECT throws_ok($$SELECT * FROM departments$$, '42501', NULL, 'anon: 部署テーブルを読めない');
SELECT throws_ok($$SELECT * FROM monthly_attendance_summary$$, '42501', NULL, 'anon: 集計ビューを読めない');
SELECT throws_ok($$SELECT is_admin()$$, '42501', NULL, 'anon: ヘルパー関数を実行できない');
RESET ROLE;

-- ----------------------------------------
-- 一般社員（部下）
-- ----------------------------------------
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000a003');
SELECT is((SELECT count(*) FROM employees), 1::bigint, '社員: 自分の社員情報だけ見える');
SELECT is_empty($$UPDATE employees SET role = 'admin' WHERE id = '00000000-0000-0000-0000-00000000e003' RETURNING id$$, '社員: 自分を管理者に昇格できない');
SELECT throws_ok(
  $$INSERT INTO requests (employee_id, request_type, status, start_date, end_date, reason)
    VALUES ('00000000-0000-0000-0000-00000000e003', 'overtime', 'approved', '2026-09-02', '2026-09-02', 'x')$$,
  '42501', NULL, '社員: 承認済みの申請を直接作れない');
SELECT throws_ok(
  $$INSERT INTO requests (employee_id, request_type, start_date, end_date, reason)
    VALUES ('00000000-0000-0000-0000-00000000e004', 'overtime', '2026-09-02', '2026-09-02', 'x')$$,
  '42501', NULL, '社員: 他人名義の申請を作れない');
SELECT throws_ok(
  $$INSERT INTO requests (employee_id, request_type, start_date, end_date, reason)
    VALUES ('00000000-0000-0000-0000-00000000e003', 'overtime', '2026-09-30', '2026-09-01', 'x')$$,
  '23514', NULL, '社員: 終了日が開始日より前の申請は作れない');
SELECT throws_ok(
  $$UPDATE requests SET reason = '改ざん' WHERE id = '00000000-0000-0000-0000-0000000000b1'::uuid$$,
  '42501', NULL, '社員: 申請内容を書き換えられない');
SELECT throws_ok(
  $$UPDATE requests SET status = 'approved' WHERE id = '00000000-0000-0000-0000-0000000000b1'::uuid$$,
  '42501', NULL, '社員: 自分の申請を承認済みにできない（取り下げ以外は拒否）');
SELECT throws_ok(
  $$INSERT INTO approvals (request_id, approver_id, action)
    VALUES ('00000000-0000-0000-0000-0000000000b1'::uuid, '00000000-0000-0000-0000-00000000e003', 'approved')$$,
  '42501', NULL, '社員: 承認記録を直接作れない');
SELECT is_empty($$SELECT id FROM audit_logs$$, '社員: 監査ログを読めない');
SELECT throws_ok(
  $$SELECT calculate_daily_attendance('00000000-0000-0000-0000-00000000e003', '2026-09-01')$$,
  '42501', NULL, '社員: 内部関数を呼べない');
SELECT throws_ok($$TRUNCATE leave_balances$$, '42501', NULL, '社員: TRUNCATE できない');

-- 打刻
SELECT lives_ok(
  $$INSERT INTO attendance_records (employee_id, attendance_type, recorded_at)
    VALUES ('00000000-0000-0000-0000-00000000e003', 'clock_in', '2020-01-01T00:00:00Z')$$,
  '社員: 出勤打刻できる');
SELECT ok(
  (SELECT recorded_at > now() - interval '1 minute' FROM attendance_records WHERE employee_id = '00000000-0000-0000-0000-00000000e003'),
  '打刻: 指定した時刻ではなくサーバー時刻で記録される');
SELECT throws_ok(
  $$INSERT INTO attendance_records (employee_id, attendance_type) VALUES ('00000000-0000-0000-0000-00000000e003', 'clock_in')$$,
  '23505', NULL, '打刻: 二重出勤できない');
SELECT throws_ok(
  $$INSERT INTO attendance_records (employee_id, attendance_type) VALUES ('00000000-0000-0000-0000-00000000e003', 'break_end')$$,
  '23514', NULL, '打刻: 休憩中でないのに休憩終了できない');
SELECT is_empty(
  $$UPDATE daily_attendances SET actual_work_minutes = 600 RETURNING id$$,
  '社員: 日次勤怠を書き換えられない');
RESET ROLE;

-- ----------------------------------------
-- 上長
-- ----------------------------------------
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000a002');
SELECT throws_ok(
  $$UPDATE requests SET status = 'approved', employee_id = '00000000-0000-0000-0000-00000000e002' WHERE id = '00000000-0000-0000-0000-0000000000b1'::uuid$$,
  '42501', NULL, '上長: 申請を直接 UPDATE できない');
SELECT is(
  decide_request('00000000-0000-0000-0000-0000000000b1'::uuid, 'approved', '了解'),
  'approved'::request_status, '上長: 部下の申請を承認できる');
SELECT is(
  (SELECT count(*) FROM approvals WHERE request_id = '00000000-0000-0000-0000-0000000000b1'::uuid),
  1::bigint, '上長: 承認と同時に承認記録が作られる');
SELECT throws_ok(
  $$SELECT decide_request('00000000-0000-0000-0000-0000000000b1'::uuid, 'rejected')$$,
  'P0001', 'この申請は既に処理されています', '上長: 処理済みの申請は再処理できない');
SELECT throws_ok(
  $$SELECT decide_request('00000000-0000-0000-0000-0000000000b2'::uuid, 'approved')$$,
  'P0001', 'この操作を行う権限がありません', '上長: 部下でない社員の申請は処理できない');
RESET ROLE;

-- ----------------------------------------
-- 管理者
-- ----------------------------------------
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000a001');
SELECT throws_ok(
  $$SELECT decide_request('00000000-0000-0000-0000-0000000000b3'::uuid, 'approved')$$,
  'P0001', '自分の申請は処理できません', '管理者: 自分の申請は承認できない');
SELECT throws_ok(
  $$UPDATE employees SET manager_id = '00000000-0000-0000-0000-00000000e003' WHERE id = '00000000-0000-0000-0000-00000000e002'$$,
  '23514', '上長の設定が循環しています', '管理者: 上長の循環を設定できない');
SELECT throws_ok(
  $$UPDATE employees SET user_id = '00000000-0000-0000-0000-00000000a004' WHERE id = '00000000-0000-0000-0000-00000000e003'$$,
  '42501', NULL, '管理者: 社員とログインアカウントの紐付けを変更できない');
SELECT is_empty(
  $$DELETE FROM employees WHERE id = '00000000-0000-0000-0000-00000000e003' RETURNING id$$,
  '管理者: 社員を削除できない（勤怠データの保全）');
SELECT lives_ok(
  $$UPDATE employees SET name = '部下（改名）' WHERE id = '00000000-0000-0000-0000-00000000e003'$$,
  '管理者: 社員情報を更新できる');
RESET ROLE;

-- ----------------------------------------
-- 無効化した管理者
-- ----------------------------------------
SELECT pg_temp.act_as('00000000-0000-0000-0000-00000000a005');
SELECT is(is_admin(), false, '無効な管理者: 管理者権限を持たない');
SELECT is(current_employee_id(), NULL::uuid, '無効な管理者: 社員として扱われない');
SELECT is_empty(
  $$UPDATE employees SET role = 'admin' WHERE id = '00000000-0000-0000-0000-00000000e004' RETURNING id$$,
  '無効な管理者: 他の社員を昇格できない');
RESET ROLE;

-- ----------------------------------------
-- 監査ログ（postgres 権限で確認）
-- ----------------------------------------
SELECT ok(
  EXISTS (SELECT 1 FROM audit_logs WHERE table_name = 'approvals' AND action = 'INSERT'),
  '監査ログ: 承認が記録される');
SELECT ok(
  EXISTS (SELECT 1 FROM audit_logs WHERE table_name = 'employees' AND action = 'UPDATE'
          AND user_id = '00000000-0000-0000-0000-00000000a001'),
  '監査ログ: 社員情報の更新が操作者付きで記録される');

SELECT * FROM finish();
ROLLBACK;
