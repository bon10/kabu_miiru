import { headers } from 'next/headers'

// サーバーコンポーネントから自アプリの /api/* を fetch するときのヘッダー。
//
// この fetch はブラウザからの新規リクエストとして扱われ、閲覧者のセッション
// Cookie を自動では持たない。middleware が /api/* を保護している（ADR 0011）ため、
// 引き継がないとログイン済みでも 401 になり画面がデータ取得に失敗する。
export async function forwardSessionCookie(): Promise<HeadersInit> {
  const cookie = (await headers()).get('cookie')
  return cookie ? { cookie } : {}
}
