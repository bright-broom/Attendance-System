import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import { supabaseCookieOptions } from './cookie-options'

// ログインなしで開けるパス（それ以外はすべてログイン必須）
const PUBLIC_PATHS = ['/login']

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

/** リダイレクトしつつ、セッション更新・削除の Cookie を引き継ぐ */
function redirectTo(request: NextRequest, sessionResponse: NextResponse, pathname: string, search = '') {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = search
  const response = NextResponse.redirect(url)
  sessionResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie))
  for (const key of ['cache-control', 'expires', 'pragma']) {
    const value = sessionResponse.headers.get(key)
    if (value) response.headers.set(key, value)
  }
  return response
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: supabaseCookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          // 認証 Cookie を含むレスポンスを CDN などにキャッシュさせない
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  const { pathname } = request.nextUrl
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return isPublicPath(pathname) ? supabaseResponse : redirectTo(request, supabaseResponse, '/login')
  }

  // 社員登録がない・無効化された社員はセッションを破棄してログイン画面へ
  const { data: employee } = await supabase
    .from('employees')
    .select('is_active')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!employee?.is_active) {
    await supabase.auth.signOut()
    return pathname === '/login'
      ? supabaseResponse
      : redirectTo(request, supabaseResponse, '/login', '?error=inactive')
  }

  if (pathname === '/login') {
    return redirectTo(request, supabaseResponse, '/dashboard')
  }

  return supabaseResponse
}
