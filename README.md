# 勤怠管理システム

Next.js 16 + Supabase で構築された次世代勤怠管理システム。

## 機能

- **打刻管理**: 出勤・退勤・休憩の打刻（楽観的UI更新で即時反映）
- **勤怠履歴**: 月別の勤怠履歴・サマリ表示
- **申請管理**: 休暇申請・残業申請の作成・承認フロー
- **管理者機能**: 社員管理・部門管理・レポート出力

## 技術スタック

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript
- **Backend**: Supabase (PostgreSQL, Auth, RLS)
- **Styling**: CSS Modules

## セットアップ

```bash
# 依存関係のインストール
npm install

# 環境変数の設定
cp .env.local.example .env.local
# .env.local に Supabase の URL、ANON KEY、SERVICE ROLE KEY を設定

# 開発サーバーの起動
npm run dev
```

## 環境変数

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
# 社員登録（認証ユーザー作成）に使用。サーバー側でのみ参照され、ブラウザには公開されない
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

社員はログイン画面から自己登録できず、管理者が「社員登録」画面から作成します。
Supabase の Authentication 設定で新規サインアップ（Allow new users to sign up）を無効にしてください。

## ディレクトリ構成

```
src/
├── app/
│   ├── (auth)/              # 認証関連ページ
│   │   └── login/
│   └── (authenticated)/     # 認証必須ページ
│       ├── attendance/      # 打刻・勤怠履歴
│       ├── dashboard/       # ダッシュボード
│       ├── requests/        # 申請管理（actions.ts: 申請作成・承認の Server Action）
│       └── admin/           # 管理者機能（layout.tsx で管理者のみに制限）
├── components/              # UIコンポーネント
├── lib/
│   ├── auth.ts              # データアクセス層: ログイン中の社員取得・ロール確認（server-only）
│   ├── supabase/            # Supabaseクライアント（server / client / proxy / admin）
│   └── utils.ts             # 日付（日本時間）などのユーティリティ
├── proxy.ts                 # セッション更新・未ログイン / 無効化社員の遮断
└── types/
    ├── supabase.ts          # DB スキーマから自動生成（手で編集しない）
    └── database.ts          # 生成型の別名
supabase/
├── migrations/              # DB マイグレーション（RLS・トリガー・関数を含む）
└── tests/database/          # 認可の回帰テスト（pgTAP）
```

## セキュリティ設計

認可は次の 3 層で多層防御しています。どれか 1 層が破られても不正操作ができないことを前提にしています。

| 層 | 役割 |
| --- | --- |
| `src/proxy.ts` | 全リクエストでセッションを更新。未ログインはログイン画面へ、社員未登録・無効化済みはセッションを破棄 |
| `src/lib/auth.ts` / Server Action | ページ・操作ごとにロールと有効状態を確認（`requireEmployee` / `requireRole`） |
| PostgreSQL（RLS・列権限・トリガー・関数） | 最終防衛線。ブラウザから anon キーで直接 API を叩かれても不正な読み書きができない |

主なルール:

- 未ログイン（anon）はアプリのテーブル・関数に一切アクセスできない
- 打刻時刻は DB のサーバー時刻で記録し、打刻の順序（出勤→休憩→退勤）を DB で検証する
- 申請の承認・却下は DB 関数 `decide_request` のみで行う（本人の申請は処理不可、上長または管理者のみ）
- 社員の削除は禁止（勤怠データの保存義務のため）。退職者は `is_active = false` にする
- 社員・部門・申請・承認・有休・打刻修正の変更は `audit_logs` に自動記録される

## 開発

```bash
npm run dev          # 開発サーバー
npm run lint         # ESLint
npm run typecheck    # 型チェック
npm run build        # 本番ビルド

supabase start       # ローカル Supabase（マイグレーションを適用）
npm run test:db      # 認可の回帰テスト（pgTAP）
npm run db:types     # スキーマ変更後に型を再生成（src/types/supabase.ts）
```

DB スキーマを変更したら、マイグレーションを追加し、`npm run db:types` で型を再生成してください。
CI（`.github/workflows/ci.yml`）で Lint・型チェック・ビルド・pgTAP テスト・型の生成漏れを確認します。

## 本番環境の設定

`supabase/config.toml` はローカル開発用です。本番の Supabase プロジェクトでは、ダッシュボードで同等の設定を行ってください。

- Authentication > Sign In / Providers: 「Allow new users to sign up」を無効（Email プロバイダ自体は有効のまま）
- Authentication > Passwords: 最小 12 文字、英大文字・小文字・数字・記号を必須、パスワード変更時の再認証を有効
- Authentication > Sessions: 非アクティブ時のタイムアウト（例: 12 時間）
- Authentication > Rate Limits / Attack Protection: サインイン回数の制限、CAPTCHA の有効化を推奨

## パフォーマンス最適化

- Server Components によるデータプリフェッチ
- Promise.all によるクエリ並列化
- 楽観的UI更新による即時フィードバック
- React.memo / useMemo / useCallback による再レンダリング最適化

## ライセンス

MIT
