'use client'

import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

// NextAuth が /login?error= で返すコードを、利用者が次の行動を判断できる文言にする。
// AccessDenied は「許可メールアドレス以外でログインした」ケース（ADR 0011）。
const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied: 'このアカウントではログインできません。許可されたアカウントで再度お試しください。',
  Configuration: '認証の設定に問題があります。環境変数を確認してください。',
  Verification: 'ログインの有効期限が切れました。もう一度お試しください。',
}

const DEFAULT_ERROR_MESSAGE = 'ログインに失敗しました。もう一度お試しください。'

export default function LoginForm() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  // ログイン後の遷移先。middleware が遮断した画面を引き継ぐ。
  const callbackUrl = searchParams.get('callbackUrl') ?? '/'

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-primary">株みーる</CardTitle>
        <CardDescription>
          複数証券会社の株式ポートフォリオを一元管理
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {ERROR_MESSAGES[error] ?? DEFAULT_ERROR_MESSAGE}
          </p>
        )}
        <Button
          className="flex w-full items-center space-x-2"
          onClick={() => signIn('google', { callbackUrl })}
        >
          <LogIn className="h-4 w-4" />
          <span>Google でログイン</span>
        </Button>
      </CardContent>
    </Card>
  )
}
