'use client'

import { SessionProvider } from 'next-auth/react'

// ヘッダーのログイン状態表示・ログアウト操作が useSession / signOut を使うため、
// クライアント側にセッションを配る。
export default function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return <SessionProvider>{children}</SessionProvider>
}
