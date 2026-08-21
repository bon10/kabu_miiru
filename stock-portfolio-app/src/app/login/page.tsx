import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import LoginForm from '@/components/auth/login-form'

// 未認証でも開ける唯一の画面（middleware の除外対象）。
export default async function LoginPage() {
  // ログイン済みで直接開かれた場合は画面を出さずダッシュボードへ戻す。
  const session = await getServerSession(authOptions)
  if (session) {
    redirect('/')
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      {/* LoginForm は useSearchParams で error / callbackUrl を読むため Suspense が要る */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
