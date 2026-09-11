/**
 * セキュリティユーティリティ
 * 入力検証、サニタイズ、レート制限など
 */

import { getTodayString } from './utils'

// ========================================
// 入力バリデーション
// ========================================

export const VALIDATION_RULES = {
  employeeNumber: {
    pattern: /^[A-Z0-9]{4,10}$/,
    maxLength: 10,
    message: '社員番号は4〜10文字の英大文字・数字で入力してください',
  },
  name: {
    pattern: /^[\p{L}\p{N}\s\-・]{1,50}$/u,
    maxLength: 50,
    message: '名前は50文字以内で入力してください',
  },
  email: {
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    maxLength: 255,
    message: '有効なメールアドレスを入力してください',
  },
  password: {
    pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    minLength: 8,
    maxLength: 128,
    message: 'パスワードは8文字以上で、大文字・小文字・数字・記号を含めてください',
  },
  departmentName: {
    pattern: /^[\p{L}\p{N}\s\-・]{1,30}$/u,
    maxLength: 30,
    message: '部門名は30文字以内で入力してください',
  },
  reason: {
    maxLength: 500,
    message: '理由は500文字以内で入力してください',
  },
  comment: {
    maxLength: 200,
    message: 'コメントは200文字以内で入力してください',
  },
  month: {
    pattern: /^\d{4}-(0[1-9]|1[0-2])$/,
    message: '有効な年月を指定してください',
  },
} as const

export type ValidationRule = keyof typeof VALIDATION_RULES

export interface ValidationResult {
  isValid: boolean
  error?: string
}

/**
 * 入力値を検証
 */
export function validate(
  value: string,
  rule: ValidationRule
): ValidationResult {
  const config = VALIDATION_RULES[rule]

  if (!value || value.trim() === '') {
    return { isValid: false, error: '必須項目です' }
  }

  if ('maxLength' in config && value.length > config.maxLength) {
    return { isValid: false, error: config.message }
  }

  if ('minLength' in config && value.length < config.minLength) {
    return { isValid: false, error: config.message }
  }

  if ('pattern' in config && !config.pattern.test(value)) {
    return { isValid: false, error: config.message }
  }

  return { isValid: true }
}

/**
 * 複数フィールドをまとめて検証
 */
export function validateFields(
  fields: Record<string, { value: string; rule: ValidationRule }>
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  let isValid = true

  for (const [key, { value, rule }] of Object.entries(fields)) {
    const result = validate(value, rule)
    if (!result.isValid) {
      isValid = false
      errors[key] = result.error || '入力エラー'
    }
  }

  return { isValid, errors }
}

// ========================================
// XSSサニタイズ
// ========================================

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
}

/**
 * HTML特殊文字をエスケープ
 */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char)
}

/**
 * 入力をサニタイズ（トリム + XSS対策）
 */
export function sanitize(input: string): string {
  return escapeHtml(input.trim())
}

// ========================================
// レート制限（クライアントサイド）
// ========================================

interface RateLimitEntry {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitEntry>()

export interface RateLimitConfig {
  maxAttempts: number
  windowMs: number
}

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 60 * 1000, // 1分
}

/**
 * レート制限をチェック
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; remainingAttempts: number; resetInMs: number } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  // エントリーがない or 期限切れ
  if (!entry || now >= entry.resetAt) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + config.windowMs,
    })
    return {
      allowed: true,
      remainingAttempts: config.maxAttempts - 1,
      resetInMs: config.windowMs,
    }
  }

  // レート制限超過
  if (entry.count >= config.maxAttempts) {
    return {
      allowed: false,
      remainingAttempts: 0,
      resetInMs: entry.resetAt - now,
    }
  }

  // カウント増加
  entry.count++
  return {
    allowed: true,
    remainingAttempts: config.maxAttempts - entry.count,
    resetInMs: entry.resetAt - now,
  }
}

/**
 * レート制限をリセット
 */
export function resetRateLimit(key: string): void {
  rateLimitStore.delete(key)
}

// ========================================
// 安全なパスワード生成
// ========================================

const CHARSET = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '@$!%*?&',
}

/**
 * 安全なランダムパスワードを生成
 */
export function generateSecurePassword(length: number = 16): string {
  const allChars = Object.values(CHARSET).join('')
  const password: string[] = []

  // 各文字種から最低1文字
  password.push(CHARSET.lowercase[Math.floor(Math.random() * CHARSET.lowercase.length)])
  password.push(CHARSET.uppercase[Math.floor(Math.random() * CHARSET.uppercase.length)])
  password.push(CHARSET.numbers[Math.floor(Math.random() * CHARSET.numbers.length)])
  password.push(CHARSET.symbols[Math.floor(Math.random() * CHARSET.symbols.length)])

  // 残りをランダムに埋める
  for (let i = password.length; i < length; i++) {
    password.push(allChars[Math.floor(Math.random() * allChars.length)])
  }

  // シャッフル
  for (let i = password.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[password[i], password[j]] = [password[j], password[i]]
  }

  return password.join('')
}

// ========================================
// URL パラメータ検証
// ========================================

/**
 * 月パラメータを検証・パース
 */
export function parseMonthParam(month: string | undefined): {
  year: number
  month: number
  isValid: boolean
} {
  // 日本時間の今月
  const [defaultYear, defaultMonth] = getTodayString().split('-').map(Number)

  if (!month) {
    return { year: defaultYear, month: defaultMonth, isValid: true }
  }

  if (!VALIDATION_RULES.month.pattern.test(month)) {
    return { year: defaultYear, month: defaultMonth, isValid: false }
  }

  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const mon = parseInt(monthStr, 10)

  // 範囲チェック（過去10年〜来年まで）
  const minYear = defaultYear - 10
  const maxYear = defaultYear + 1

  if (year < minYear || year > maxYear) {
    return { year: defaultYear, month: defaultMonth, isValid: false }
  }

  return { year, month: mon, isValid: true }
}

// ========================================
// CSRFトークン（簡易実装）
// ========================================

let csrfToken: string | null = null

/**
 * CSRFトークンを取得（クライアントサイド用）
 */
export function getCsrfToken(): string {
  if (!csrfToken) {
    csrfToken = crypto.randomUUID()
  }
  return csrfToken
}

/**
 * CSRFトークンを再生成
 */
export function regenerateCsrfToken(): string {
  csrfToken = crypto.randomUUID()
  return csrfToken
}
