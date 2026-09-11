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
│   ├── (auth)/           # 認証関連ページ
│   │   └── login/
│   └── (authenticated)/  # 認証必須ページ
│       ├── attendance/   # 打刻・勤怠履歴
│       ├── dashboard/    # ダッシュボード
│       ├── requests/     # 申請管理
│       └── admin/        # 管理者機能
├── components/           # UIコンポーネント
├── lib/
│   ├── supabase/         # Supabaseクライアント
│   └── utils.ts          # ユーティリティ関数
└── types/                # 型定義
```

## パフォーマンス最適化

- Server Components によるデータプリフェッチ
- Promise.all によるクエリ並列化
- 楽観的UI更新による即時フィードバック
- React.memo / useMemo / useCallback による再レンダリング最適化

## ライセンス

MIT
