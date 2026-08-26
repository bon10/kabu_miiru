import DashboardClient from '@/components/dashboard-client'
import { forwardSessionCookie } from '@/lib/server-fetch'

// 閲覧者のセッション Cookie を引き継いで自アプリの API を呼ぶため、リクエストが
// 存在しないビルド時には描画できない。宣言しないと Next.js が静的生成を試み、
// headers() が投げる DYNAMIC_SERVER_USAGE がビルドログに毎回出る。
export const dynamic = 'force-dynamic'

// サーバーコンポーネントでサマリーデータを取得
async function getSummaryData() {
  try {
    const response = await fetch(
      `${process.env.NEXTAUTH_URL || 'http://localhost:3300'}/api/summary`,
      {
        cache: 'no-store',
        headers: await forwardSessionCookie(),
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch summary data')
    }

    const result = await response.json()
    return result.data
  } catch (error) {
    console.error('Error fetching summary:', error)
    return null
  }
}

export default async function Dashboard() {
  const summary = await getSummaryData()

  if (!summary) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">ダッシュボード</h1>
        <p className="text-muted-foreground">
          データの読み込みに失敗しました。
        </p>
      </div>
    )
  }

  return <DashboardClient summary={summary} />
}
