import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { createErrorResponse } from '@/lib/api-response'

// 未認証アクセスの遮断（ADR 0011）。
//
// 画面と業務 API をまとめて保護する。画面はログイン画面へ誘導し、API は
// 画面用 fetch の呼び出し元が結果を判別できるよう HTML ではなく 401 JSON を返す。

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })

  if (token) {
    return NextResponse.next()
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json(
      createErrorResponse('UNAUTHORIZED', 'ログインが必要です'),
      { status: 401 },
    )
  }

  // ログイン後に元の画面へ戻れるよう、遷移先を callbackUrl として渡す。
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set(
    'callbackUrl',
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  )
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    // 全パスを保護し、次だけ除外する。
    // - api/auth   : ログイン処理そのもの
    // - api/batch  : X-API-Key（将来は CRON_SECRET）で認証しており、
    //                ブラウザのセッションを持たない cron から呼ばれる
    // - login      : 未認証で開く画面
    // - _next, favicon.ico : ビルド成果物と静的ファイル
    '/((?!api/auth|api/batch|login|_next/static|_next/image|favicon.ico).*)',
  ],
}
