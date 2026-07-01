'use client'

import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CalendarDays, Plus, Filter } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  TransactionFormDialog,
  type StockOption,
} from '@/components/transactions/transaction-form-dialog'

interface TransactionRow {
  id: number
  stockId: number
  stockName: string
  stockCode: string
  transactionType: 'BUY' | 'SELL'
  shares: number
  pricePerShare: number
  totalAmount: number
  fee: number
  transactionDate: string
  memo?: string | null
}

interface TransactionsResponse {
  data: {
    transactions: TransactionRow[]
    pagination: {
      currentPage: number
      totalPages: number
      totalCount: number
    }
  }
}

interface SummaryResponse {
  data: {
    totalTransactions: number
    totalBuyAmount: number
    totalSellAmount: number
    totalDividend: number
    totalFees: number
    periodStats: {
      thisMonth: { buyCount: number; sellCount: number; totalAmount: number }
      thisYear: { buyCount: number; sellCount: number; totalAmount: number }
    }
  }
}

interface StocksResponse {
  data: {
    stocks: Array<{
      id: number
      stockName: string
      code: string
      sharesHeld: number
    }>
  }
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

export default function TransactionsClient() {
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [selectedType, setSelectedType] = useState<'all' | 'BUY' | 'SELL'>(
    'all'
  )
  const [sortBy, setSortBy] = useState('date-desc')
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: txData, mutate: mutateTx } = useSWR<TransactionsResponse>(
    '/api/transactions?limit=200',
    fetcher
  )
  const { data: sumData, mutate: mutateSum } = useSWR<SummaryResponse>(
    '/api/transactions/summary?period=year',
    fetcher
  )
  const { data: stocksData } = useSWR<StocksResponse>(
    '/api/stocks?includeZero=true',
    fetcher
  )

  const summary = sumData?.data
  const stocks: StockOption[] = useMemo(
    () =>
      (stocksData?.data.stocks ?? []).map((s) => ({
        id: s.id,
        stockName: s.stockName,
        code: s.code,
        sharesHeld: Number(s.sharesHeld ?? 0),
      })),
    [stocksData]
  )

  const filteredAndSortedTransactions = useMemo(() => {
    let filtered = [...(txData?.data.transactions ?? [])]

    if (selectedPeriod !== 'all') {
      const now = new Date()
      const cutoffDate = new Date()
      switch (selectedPeriod) {
        case 'this-month':
          cutoffDate.setMonth(now.getMonth())
          cutoffDate.setDate(1)
          break
        case 'this-year':
          cutoffDate.setFullYear(now.getFullYear())
          cutoffDate.setMonth(0)
          cutoffDate.setDate(1)
          break
        case 'last-3-months':
          cutoffDate.setMonth(now.getMonth() - 3)
          break
      }
      filtered = filtered.filter(
        (t) => new Date(t.transactionDate) >= cutoffDate
      )
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter((t) => t.transactionType === selectedType)
    }

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return (
            new Date(b.transactionDate).getTime() -
            new Date(a.transactionDate).getTime()
          )
        case 'date-asc':
          return (
            new Date(a.transactionDate).getTime() -
            new Date(b.transactionDate).getTime()
          )
        case 'amount-desc':
          return b.totalAmount - a.totalAmount
        case 'amount-asc':
          return a.totalAmount - b.totalAmount
        case 'stock-name':
          return a.stockName.localeCompare(b.stockName)
        default:
          return 0
      }
    })

    return filtered
  }, [txData, selectedPeriod, selectedType, sortBy])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">取引履歴</h1>
          <p className="text-muted-foreground">購入・売却取引の管理と分析</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="flex items-center space-x-2"
        >
          <Plus className="h-4 w-4" />
          <span>新規取引追加</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総取引数</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.totalTransactions ?? '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">購入総額</CardTitle>
            <div className="text-blue-600">買</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCurrency(summary.totalBuyAmount) : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">売却総額</CardTitle>
            <div className="text-green-600">売</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCurrency(summary.totalSellAmount) : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">手数料合計</CardTitle>
            <div className="text-muted-foreground">¥</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCurrency(summary.totalFees) : '-'}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Filter className="h-5 w-5" />
            <span>フィルター・ソート</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">期間</label>
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger>
                  <SelectValue placeholder="期間を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全期間</SelectItem>
                  <SelectItem value="this-month">今月</SelectItem>
                  <SelectItem value="this-year">今年</SelectItem>
                  <SelectItem value="last-3-months">過去3ヶ月</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">取引種別</label>
              <Select
                value={selectedType}
                onValueChange={(v) =>
                  setSelectedType(v as 'all' | 'BUY' | 'SELL')
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="取引種別を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全て</SelectItem>
                  <SelectItem value="BUY">購入</SelectItem>
                  <SelectItem value="SELL">売却</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">ソート</label>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger>
                  <SelectValue placeholder="ソート順を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date-desc">日付（新しい順）</SelectItem>
                  <SelectItem value="date-asc">日付（古い順）</SelectItem>
                  <SelectItem value="amount-desc">金額（高い順）</SelectItem>
                  <SelectItem value="amount-asc">金額（低い順）</SelectItem>
                  <SelectItem value="stock-name">銘柄名順</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>取引履歴一覧</CardTitle>
          <p className="text-sm text-muted-foreground">
            {filteredAndSortedTransactions.length}件の取引
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredAndSortedTransactions.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center space-x-4">
                  <Badge
                    className={
                      t.transactionType === 'BUY'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-green-100 text-green-800'
                    }
                  >
                    {t.transactionType === 'BUY' ? '購入' : '売却'}
                  </Badge>
                  <div>
                    <div className="font-medium">{t.stockName}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(t.transactionDate)}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-medium">
                    {formatCurrency(t.totalAmount)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t.shares}株 × {formatCurrency(t.pricePerShare)}
                  </div>
                  {t.fee > 0 && (
                    <div className="text-xs text-muted-foreground">
                      手数料: {formatCurrency(t.fee)}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {filteredAndSortedTransactions.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                条件に一致する取引がありません
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>今月のサマリー</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span>購入取引</span>
              <span className="font-medium">
                {summary?.periodStats.thisMonth.buyCount ?? 0}件
              </span>
            </div>
            <div className="flex justify-between">
              <span>売却取引</span>
              <span className="font-medium">
                {summary?.periodStats.thisMonth.sellCount ?? 0}件
              </span>
            </div>
            <div className="flex justify-between">
              <span>合計金額</span>
              <span className="font-medium">
                {summary
                  ? formatCurrency(summary.periodStats.thisMonth.totalAmount)
                  : '-'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>今年のサマリー</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span>購入取引</span>
              <span className="font-medium">
                {summary?.periodStats.thisYear.buyCount ?? 0}件
              </span>
            </div>
            <div className="flex justify-between">
              <span>売却取引</span>
              <span className="font-medium">
                {summary?.periodStats.thisYear.sellCount ?? 0}件
              </span>
            </div>
            <div className="flex justify-between">
              <span>今年の配当（受取）</span>
              <span className="font-medium">
                {summary ? formatCurrency(summary.totalDividend) : '-'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        stocks={stocks}
        onSubmitted={() => {
          mutateTx()
          mutateSum()
        }}
      />
    </div>
  )
}
