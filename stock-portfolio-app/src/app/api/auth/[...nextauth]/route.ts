import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

// NextAuth のエンドポイント（/api/auth/signin, /callback, /session, /signout）。
// ログイン処理そのものなので middleware の保護対象からは除外している。
const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
