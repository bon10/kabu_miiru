import type { NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

// 認証設定（ADR 0011）。
//
// 本アプリの利用者は所有者 1 人だけという前提で、Google でログインした
// メールアドレスが ALLOWED_LOGIN_EMAIL と一致するかだけで許可・拒否を決める。
// ユーザーを DB に持たないため、セッションは JWT に閉じて Prisma を介さない。

// 許可するメールアドレス。未設定なら誰も入れない（設定漏れで全開放になるのを防ぐ）。
const ALLOWED_LOGIN_EMAIL = process.env.ALLOWED_LOGIN_EMAIL

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    }),
  ],

  session: { strategy: 'jwt' },

  // NextAuth 既定のログイン画面ではなく本アプリの画面を使う。
  // error も同じ画面に寄せて、許可外アカウントの拒否をログイン画面上で伝える。
  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    async signIn({ profile }) {
      if (!ALLOWED_LOGIN_EMAIL) {
        console.error('ALLOWED_LOGIN_EMAIL が未設定のためログインを拒否しました')
        return false
      }

      const email = profile?.email
      if (!email) return false

      // Google 側で確認が取れていないメールアドレスは、所有者本人のものと
      // 断定できないため許可リストと一致しても拒否する。
      const isVerified = (profile as { email_verified?: boolean }).email_verified
      if (!isVerified) return false

      return email.toLowerCase() === ALLOWED_LOGIN_EMAIL.toLowerCase()
    },
  },
}
