'use client'

import { use, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { checkRateLimit, validate } from '@/lib/security'
import styles from './page.module.css'

const LOGIN_RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 5 * 60 * 1000, // 5分間に5回まで
}

interface LoginPageProps {
  searchParams: Promise<{ error?: string }>
}

export default function LoginPage({ searchParams }: LoginPageProps) {
  const router = useRouter()
  const { error: errorParam } = use(searchParams)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // 無効化された社員などでセッションが破棄された場合
  const [error, setError] = useState(
    errorParam === 'inactive' ? 'このアカウントは利用できません。管理者にお問い合わせください' : ''
  )
  const [isLoading, setIsLoading] = useState(false)
  const [isLocked, setIsLocked] = useState(false)

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // 入力バリデーション
    const emailValidation = validate(email, 'email')
    if (!emailValidation.isValid) {
      setError(emailValidation.error || '入力エラー')
      return
    }

    if (!password || password.length < 1) {
      setError('パスワードを入力してください')
      return
    }

    // レート制限チェック
    const rateLimit = checkRateLimit(`login:${email}`, LOGIN_RATE_LIMIT)
    if (!rateLimit.allowed) {
      const minutes = Math.ceil(rateLimit.resetInMs / 60000)
      setError(`ログイン試行回数が上限に達しました。${minutes}分後に再試行してください`)
      setIsLocked(true)

      // ロックアウト解除タイマー
      setTimeout(() => {
        setIsLocked(false)
      }, rateLimit.resetInMs)
      return
    }

    setIsLoading(true)

    try {
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (authError) {
        setError('メールアドレスまたはパスワードが正しくありません')
        setIsLoading(false)
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch {
      setError('ログイン処理中にエラーが発生しました')
      setIsLoading(false)
    }
  }, [email, password, router])

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <CardHeader>
          <CardTitle>勤怠管理システム</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className={styles.form}>
            <Input
              id="email"
              type="email"
              label="メールアドレス"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
              autoComplete="email"
              maxLength={255}
              disabled={isLocked}
            />
            <Input
              id="password"
              type="password"
              label="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワード"
              required
              autoComplete="current-password"
              maxLength={128}
              disabled={isLocked}
            />
            {error && <p className={styles.error}>{error}</p>}
            <Button
              type="submit"
              isLoading={isLoading}
              disabled={isLocked}
              className={styles.button}
            >
              {isLocked ? `ロック中...` : 'ログイン'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
