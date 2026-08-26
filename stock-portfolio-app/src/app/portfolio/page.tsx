import PortfolioClient from '@/components/portfolio/portfolio-client'
import { forwardSessionCookie } from '@/lib/server-fetch'

// 閲覧者のセッション Cookie を引き継いで自アプリの API を呼ぶため、リクエストが
// 存在しないビルド時には描画できない。宣言しないと Next.js が静的生成を試み、
// headers() が投げる DYNAMIC_SERVER_USAGE がビルドログに毎回出る。
export const dynamic = 'force-dynamic'

// サーバーコンポーネントでポートフォリオデータを取得
async function getPortfolioData() {
  try {
    const sessionCookie = await forwardSessionCookie()
    const [compositionResponse, performanceResponse] = await Promise.all([
      fetch(
        `${process.env.NEXTAUTH_URL || 'http://localhost:3300'}/api/portfolio/composition`,
        {
          cache: 'no-store',
          headers: sessionCookie,
        }
      ),
      fetch(
        `${process.env.NEXTAUTH_URL || 'http://localhost:3300'}/api/portfolio/performance`,
        {
          cache: 'no-store',
          headers: sessionCookie,
        }
      ),
    ])

    if (!compositionResponse.ok || !performanceResponse.ok) {
      throw new Error('Failed to fetch portfolio data')
    }

    const [compositionResult, performanceResult] = await Promise.all([
      compositionResponse.json(),
      performanceResponse.json(),
    ])

    return {
      composition: compositionResult.data,
      performance: performanceResult.data,
    }
  } catch (error) {
    console.error('Error fetching portfolio data:', error)
    return null
  }
}

export default async function PortfolioPage() {
  const portfolioData = await getPortfolioData()

  if (!portfolioData) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">ポートフォリオ</h1>
        <p className="text-muted-foreground">
          データの読み込みに失敗しました。
        </p>
      </div>
    )
  }

  return <PortfolioClient portfolioData={portfolioData} />
}
