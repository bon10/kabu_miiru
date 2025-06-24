'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, DollarSign, PieChart, History, ArrowRight } from 'lucide-react'
import { formatCurrency, formatPercentage, formatDate } from '@/lib/utils'
import Link from 'next/link'

interface DashboardClientProps {
  summary: {
    totalInvestment: number
    totalCurrentValue: number
    totalProfitLoss: number
    totalProfitLossRate: number
    totalDividend: number
    stockCount: number
    companiesCount: number
    lastUpdated: string
    marketBreakdown: {
      domestic: {
        investment: number
        profitLoss: number
        stockCount: number
      }
      us: {
        investment: number
        profitLoss: number
        stockCount: number
      }
    }
  }
}

export default function DashboardClient({ summary }: DashboardClientProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const profitLossColor = summary.totalProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'
  const isProfit = summary.totalProfitLoss >= 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ダッシュボード</h1>
        <p className="text-muted-foreground">
          ポートフォリオ全体の状況
        </p>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              総投資額
            </CardTitle>
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
            <CardTitle className="text-sm font-medium">
              現在価値
            </CardTitle>
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
            <CardTitle className="text-sm font-medium">
              損益
            </CardTitle>
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
              配当金額
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.totalDividend)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* クイックアクセス */}
      <Card>
        <CardHeader>
          <CardTitle>クイックアクセス</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/stocks">
              <Button variant="outline" className="w-full h-16 flex-col space-y-2">
                <TrendingUp className="h-6 w-6" />
                <span>銘柄一覧</span>
              </Button>
            </Link>
            <Link href="/portfolio">
              <Button variant="outline" className="w-full h-16 flex-col space-y-2">
                <PieChart className="h-6 w-6" />
                <span>ポートフォリオ</span>
              </Button>
            </Link>
            <Link href="/transactions">
              <Button variant="outline" className="w-full h-16 flex-col space-y-2">
                <History className="h-6 w-6" />
                <span>取引履歴</span>
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* 詳細情報 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>市場別内訳</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>国内株式</span>
                <span className="font-medium">
                  {formatCurrency(summary.marketBreakdown.domestic.investment)}
                </span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{summary.marketBreakdown.domestic.stockCount}銘柄</span>
                <span className={summary.marketBreakdown.domestic.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatCurrency(summary.marketBreakdown.domestic.profitLoss)}
                </span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>米国株式</span>
                <span className="font-medium">
                  {formatCurrency(summary.marketBreakdown.us.investment)}
                </span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{summary.marketBreakdown.us.stockCount}銘柄</span>
                <span className={summary.marketBreakdown.us.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {formatCurrency(summary.marketBreakdown.us.profitLoss)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ポートフォリオ概要</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span>保有銘柄数</span>
              <span className="font-medium">{summary.stockCount}</span>
            </div>
            <div className="flex justify-between">
              <span>証券会社数</span>
              <span className="font-medium">{summary.companiesCount}</span>
            </div>
            <div className="flex justify-between">
              <span>最終更新</span>
              <span className="text-sm text-muted-foreground">
                {mounted ? new Date(summary.lastUpdated).toLocaleString('ja-JP') : '更新中...'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}