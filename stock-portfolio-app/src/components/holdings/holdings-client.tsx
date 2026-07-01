'use client'

import Link from 'next/link'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Building2, Coins, TrendingDown, TrendingUp } from 'lucide-react'
import { formatCurrency, formatPercentage } from '@/lib/utils'

interface HoldingRow {
  id: number
  stockName: string
  code: string
  market: string
  sharesHeld: number
  avgAcquisitionPrice: number
  investmentAmount: number
  currentPrice: number
  currentValue: number
  profitLoss: number
  profitLossRate: number
  ytdDividend: number
}

interface BrokerGroup {
  brokerName: string
  stockCount: number
  totalInvestment: number
  totalCurrentValue: number
  totalProfitLoss: number
  totalProfitLossRate: number
  totalYtdDividend: number
  holdings: HoldingRow[]
}

interface GrandTotal {
  totalInvestment: number
  totalCurrentValue: number
  totalProfitLoss: number
  totalProfitLossRate: number
  totalYtdDividend: number
  totalStocks: number
  brokerCount: number
}

interface ApiResponse {
  data: {
    brokers: BrokerGroup[]
    grandTotal: GrandTotal
  }
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

const profitColor = (value: number) =>
  value >= 0 ? 'text-green-600' : 'text-red-600'

export default function HoldingsClient() {
  const { data, isLoading } = useSWR<ApiResponse>(
    '/api/holdings/by-broker',
    fetcher
  )
  const brokers = data?.data.brokers ?? []
  const grand = data?.data.grandTotal

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">保有商品一覧</h1>
        <p className="text-muted-foreground">
          証券会社別の保有銘柄ビュー（保有株数 0 は非表示）
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">証券会社数</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {grand?.brokerCount ?? '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {grand?.totalStocks ?? '-'}銘柄保有
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">投資総額</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {grand ? formatCurrency(grand.totalInvestment) : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">評価額</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {grand ? formatCurrency(grand.totalCurrentValue) : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">評価損益</CardTitle>
            {grand && grand.totalProfitLoss >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${grand ? profitColor(grand.totalProfitLoss) : ''}`}
            >
              {grand ? formatCurrency(grand.totalProfitLoss) : '-'}
            </div>
            <p
              className={`text-xs ${grand ? profitColor(grand.totalProfitLoss) : ''}`}
            >
              {grand ? formatPercentage(grand.totalProfitLossRate / 100) : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">今年の配当</CardTitle>
            <Coins className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {grand ? formatCurrency(grand.totalYtdDividend) : '-'}
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">読み込み中...</p>
      ) : brokers.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            保有銘柄がありません。
          </CardContent>
        </Card>
      ) : (
        brokers.map((broker) => (
          <Card key={broker.brokerName}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">{broker.brokerName}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {broker.stockCount}銘柄 / 投資額{' '}
                    {formatCurrency(broker.totalInvestment)} / 評価額{' '}
                    {formatCurrency(broker.totalCurrentValue)}
                  </p>
                </div>
                <div className="text-right">
                  <div
                    className={`text-lg font-semibold ${profitColor(broker.totalProfitLoss)}`}
                  >
                    {formatCurrency(broker.totalProfitLoss)}
                  </div>
                  <div
                    className={`text-sm ${profitColor(broker.totalProfitLoss)}`}
                  >
                    {formatPercentage(broker.totalProfitLossRate / 100)}
                  </div>
                  {broker.totalYtdDividend > 0 && (
                    <div className="text-xs text-yellow-700 mt-1">
                      今年配当 {formatCurrency(broker.totalYtdDividend)}
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>銘柄</TableHead>
                    <TableHead>市場</TableHead>
                    <TableHead className="text-right">保有株数</TableHead>
                    <TableHead className="text-right">平均取得</TableHead>
                    <TableHead className="text-right">現在価格</TableHead>
                    <TableHead className="text-right">投資額</TableHead>
                    <TableHead className="text-right">評価額</TableHead>
                    <TableHead className="text-right">損益</TableHead>
                    <TableHead className="text-right">今年配当</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {broker.holdings.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell>
                        <Link
                          href={`/stocks/${h.id}`}
                          className="font-medium hover:underline"
                        >
                          {h.stockName}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {h.code}
                        </div>
                      </TableCell>
                      <TableCell>{h.market}</TableCell>
                      <TableCell className="text-right">
                        {h.sharesHeld}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(h.avgAcquisitionPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(h.currentPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(h.investmentAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(h.currentValue)}
                      </TableCell>
                      <TableCell
                        className={`text-right ${profitColor(h.profitLoss)}`}
                      >
                        <div>{formatCurrency(h.profitLoss)}</div>
                        <div className="text-xs">
                          {formatPercentage(h.profitLossRate / 100)}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {h.ytdDividend > 0
                          ? formatCurrency(h.ytdDividend)
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
