import { describe, it, expect, vi, afterEach } from 'vitest'
import type { NextAuthOptions } from 'next-auth'

// ログイン許可判定（ADR 0011）のテスト。
// ALLOWED_LOGIN_EMAIL はモジュール読み込み時に確定するため、環境変数を差し替えて
// 毎回読み直す。
async function loadSignInCallback(allowedEmail: string | undefined) {
  vi.resetModules()
  if (allowedEmail === undefined) {
    delete process.env.ALLOWED_LOGIN_EMAIL
  } else {
    process.env.ALLOWED_LOGIN_EMAIL = allowedEmail
  }
  const { authOptions } = (await import('./auth')) as { authOptions: NextAuthOptions }
  return authOptions.callbacks!.signIn!
}

// signIn コールバックは NextAuth から user / account も渡されるが、判定に使うのは
// profile だけなので、テストでは profile のみ与える。
function signInWith(
  signIn: Awaited<ReturnType<typeof loadSignInCallback>>,
  profile: Record<string, unknown>,
) {
  return signIn({ profile } as unknown as Parameters<typeof signIn>[0])
}

const ORIGINAL_ALLOWED_EMAIL = process.env.ALLOWED_LOGIN_EMAIL

afterEach(() => {
  if (ORIGINAL_ALLOWED_EMAIL === undefined) {
    delete process.env.ALLOWED_LOGIN_EMAIL
  } else {
    process.env.ALLOWED_LOGIN_EMAIL = ORIGINAL_ALLOWED_EMAIL
  }
  vi.restoreAllMocks()
})

describe('signIn コールバック', () => {
  it('許可メールアドレスと一致し確認済みなら許可する', async () => {
    const signIn = await loadSignInCallback('owner@example.com')

    await expect(
      signInWith(signIn, { email: 'owner@example.com', email_verified: true }),
    ).resolves.toBe(true)
  })

  it('大文字小文字の違いは同一メールアドレスとして扱う', async () => {
    const signIn = await loadSignInCallback('owner@example.com')

    await expect(
      signInWith(signIn, { email: 'Owner@Example.com', email_verified: true }),
    ).resolves.toBe(true)
  })

  it('許可メールアドレス以外は拒否する', async () => {
    const signIn = await loadSignInCallback('owner@example.com')

    await expect(
      signInWith(signIn, { email: 'someone@example.com', email_verified: true }),
    ).resolves.toBe(false)
  })

  it('Google 側で未確認のメールアドレスは、一致していても拒否する', async () => {
    const signIn = await loadSignInCallback('owner@example.com')

    await expect(
      signInWith(signIn, { email: 'owner@example.com', email_verified: false }),
    ).resolves.toBe(false)
  })

  it('メールアドレスを取得できない場合は拒否する', async () => {
    const signIn = await loadSignInCallback('owner@example.com')

    await expect(signInWith(signIn, { email_verified: true })).resolves.toBe(false)
  })

  // 設定漏れが全開放にならないことの確認（fail closed）
  it('ALLOWED_LOGIN_EMAIL 未設定なら誰も許可しない', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const signIn = await loadSignInCallback(undefined)

    await expect(
      signInWith(signIn, { email: 'owner@example.com', email_verified: true }),
    ).resolves.toBe(false)
  })
})
