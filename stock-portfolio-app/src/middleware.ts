import { NextResponse, type NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { createErrorResponse } from '@/lib/api-response'

// 未認証アクセスの遮断（ADR 0011）。
//
// 画面と業務 API をまとめて保護する。画面はログイン画面へ誘導し、API は
// 画面用 fetch の呼び出し元が結果を判別できるよう HTML ではなく 401 JSON を返す。
//
// ログイン済みかどうかの判定は、この middleware の getToken だけが行う。
// ログイン画面側にも判定を置くと（getServerSession など）、両者が食い違ったときに
// middleware が /login へ送り、/login が / へ送り返して無限リダイレクトになる。
// その状態では画面もエラーも表示されず原因を追えないため、判定は 1 か所に閉じる。

export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })
  const isLoginPage = request.nextUrl.pathname === '/login'

  if (token) {
    // ログイン済みの利用者がログイン画面を開いてもすることが無いため、
    // ダッシュボードへ戻す。ヘッダーはログイン画面で非表示になるため、
    // ここで戻さないとナビゲーションの無い画面に取り残される。
    if (isLoginPage) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return NextResponse.next()
  }

  // ここから先は未ログイン扱い。
  //
  // getToken はクッキーが無い場合も復号に失敗した場合も等しく null を返すため、
  // このままでは「ログインしていない」のか「セッションが壊れている」のか区別が
  // つかない。raw で取り直してクッキーの有無を確かめ、復号だけが失敗している
  // 場合は記録する。NEXTAUTH_SECRET の不一致や、別の設定で発行された古い
  // クッキーの残存がこれにあたる。
  const rawToken = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    raw: true,
  })
  if (rawToken) {
    console.error(
      'セッションクッキーは届いているが復号できませんでした。NEXTAUTH_SECRET の不一致、または古い設定で発行されたクッキーの残存が考えられます。',
      { pathname: request.nextUrl.pathname },
    )
  }

  // 未ログインで開ける唯一の画面。
  if (isLoginPage) {
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
    // 全パスを middleware に通し、次だけ除外する。
    // - api/auth   : ログイン処理そのもの
    // - api/batch  : X-API-Key / CRON_SECRET で認証しており、
    //                ブラウザのセッションを持たない cron から呼ばれる
    // - _next, favicon.ico : ビルド成果物と静的ファイル
    //
    // /login は除外しない。未ログインなら通し、ログイン済みなら / へ戻す判断を
    // この middleware が行うことで、セッション判定を 1 か所に保つ。
    '/((?!api/auth|api/batch|_next/static|_next/image|favicon.ico).*)',
  ],
}
