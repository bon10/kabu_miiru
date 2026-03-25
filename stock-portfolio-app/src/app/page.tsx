import DashboardClient from '@/components/dashboard-client'

// サーバーコンポーネントでサマリーデータを取得
async function getSummaryData() {
  try {
    const response = await fetch(
      `${process.env.NEXTAUTH_URL || 'http://localhost:3300'}/api/summary`,
      {
        cache: 'no-store',
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
