import { Suspense } from 'react'
import LoginForm from '@/components/auth/login-form'

// 未ログインで開ける唯一の画面。
//
// ログイン済みかどうかの判定はここでは行わない。middleware が getToken で判定し、
// ログイン済みならこの画面に到達する前に / へ戻す。ここに 2 つ目の判定を置くと、
// middleware と食い違ったときに互いにリダイレクトし合い、画面が出ないまま
// 無限リダイレクトになる。
export default function LoginPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      {/* LoginForm は useSearchParams で error / callbackUrl を読むため Suspense が要る */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
