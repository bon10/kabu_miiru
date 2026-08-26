'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Building2,
  Coins,
  DollarSign,
  History,
  PieChart,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/utils'

// ダッシュボードのカードは全体像だけを表示し、詳しい分析は /portfolio に委譲する。
// 用語は docs/2-domain/ubiquitous-language.md を参照。
interface DashboardClientProps {
  summary: {
    totalInvestment: number
    totalCurrentValue: number
    totalProfitLoss: number
    totalProfitLossRate: number
    expectedAnnualDividend: number
    ytdDividendReceived: number
    stockCount: number
    companiesCount: number
    lastUpdated: string
  }
}

// 推移 API の 1 点（ADR 0009）。評価額・投資元本は保存値ではなく読み取り時の再構成値。
interface TimelinePoint {
  date: string
  marketValue: number
  investedPrincipal: number
  unrealizedPL: number
  cumulativeRealizedPL: number
  cumulativeDividends: number
}

interface TimelineResponse {
  data: { points: TimelinePoint[] }
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

export default function DashboardClient({ summary }: DashboardClientProps) {
  const [mounted, setMounted] = useState(false)
  const { data: timelineData } = useSWR<TimelineResponse>(
    '/api/portfolio/timeline?range=1y',
    fetcher
  )

  useEffect(() => {
    setMounted(true)
  }, [])

  const profitLossColor =
    summary.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'
  const isProfit = summary.totalProfitLoss >= 0

  // 推移は日次で返るため、ダッシュボードでは評価額と投資元本の 2 本だけを見せる。
  // 詳細（評価損益・配当の内訳）は /portfolio に委譲する。
  const chartData =
    timelineData?.data.points?.map((p) => ({
      label: p.date,
      marketValue: p.marketValue,
      investedPrincipal: p.investedPrincipal,
    })) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ダッシュボード</h1>
        <p className="text-muted-foreground">
          全体像の一望。詳細な分析は各画面へ。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">投資額</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.totalInvestment)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">評価額</CardTitle>
            <PieChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.totalCurrentValue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">評価損益</CardTitle>
            {isProfit ? (
              <TrendingUp className={`h-4 w-4 ${profitLossColor}`} />
            ) : (
              <TrendingDown className={`h-4 w-4 ${profitLossColor}`} />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${profitLossColor}`}>
              {formatCurrency(summary.totalProfitLoss)}
            </div>
            <p className={`text-xs ${profitLossColor}`}>
              {formatPercentage(summary.totalProfitLossRate)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              今年の配当（受取）
            </CardTitle>
            <Coins className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.ytdDividendReceived)}
            </div>
            <p className="text-xs text-muted-foreground">
              予想年間配当 {formatCurrency(summary.expectedAnnualDividend)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>直近1年の資産推移</CardTitle>
          <Link
            href="/portfolio"
            className="text-sm text-primary hover:underline"
          >
            詳細を見る →
          </Link>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-muted-foreground">取引履歴がまだありません。</p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" minTickGap={40} />
                  <YAxis
                    tickFormatter={(value) =>
                      `${Math.round((value as number) / 1000)}k`
                    }
                  />
                  <Tooltip
                    formatter={(value) => formatCurrency(value as number)}
                  />
                  <Line
                    type="monotone"
                    dataKey="marketValue"
                    name="評価額"
                    stroke="#0088FE"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="investedPrincipal"
                    name="投資元本"
                    stroke="#8884d8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/holdings">
          <Button variant="outline" className="w-full h-16 flex-col space-y-2">
            <Building2 className="h-6 w-6" />
            <span>保有一覧</span>
          </Button>
        </Link>
        <Link href="/portfolio">
          <Button variant="outline" className="w-full h-16 flex-col space-y-2">
            <PieChart className="h-6 w-6" />
            <span>ポートフォリオ分析</span>
          </Button>
        </Link>
        <Link href="/transactions">
          <Button variant="outline" className="w-full h-16 flex-col space-y-2">
            <History className="h-6 w-6" />
            <span>取引履歴</span>
          </Button>
        </Link>
        <Link href="/dividends">
          <Button variant="outline" className="w-full h-16 flex-col space-y-2">
            <Coins className="h-6 w-6" />
            <span>配当</span>
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ポートフォリオ概要</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">保有銘柄数</p>
            <p className="text-xl font-medium">{summary.stockCount}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">証券会社数</p>
            <p className="text-xl font-medium">{summary.companiesCount}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">最終価格更新</p>
            <p className="text-sm">
              {mounted
                ? new Date(summary.lastUpdated).toLocaleString('ja-JP')
                : '更新中...'}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
