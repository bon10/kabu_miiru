'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, CalendarDays, Plus, Filter } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

interface TransactionsClientProps {
  transactionsData: {
    transactions: Array<{
      id: number
      stockName: string
      transactionType: string
      shares: number
      pricePerShare: number
      totalAmount: number
      fee: number
      transactionDate: string
      memo?: string
    }>
    summary: {
      totalTransactions: number
      totalBuyAmount: number
      totalSellAmount: number
      totalDividend: number
      totalFees: number
      periodStats: {
        thisMonth: {
          buyCount: number
          sellCount: number
          dividendCount: number
          totalAmount: number
        }
        thisYear: {
          buyCount: number
          sellCount: number
          dividendCount: number
          totalAmount: number
        }
      }
    }
  }
}

export default function TransactionsClient({ transactionsData }: TransactionsClientProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [sortBy, setSortBy] = useState('date-desc')

  // フィルタリングとソート
  const filteredAndSortedTransactions = useMemo(() => {
    let filtered = transactionsData.transactions

    // 期間フィルター
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

      filtered = filtered.filter(transaction => 
        new Date(transaction.transactionDate) >= cutoffDate
      )
    }

    // 取引種別フィルター
    if (selectedType !== 'all') {
      filtered = filtered.filter(transaction => 
        transaction.transactionType === selectedType
      )
    }

    // ソート
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'date-desc':
          return new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime()
        case 'date-asc':
          return new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
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
  }, [transactionsData.transactions, selectedPeriod, selectedType, sortBy])

  const getTransactionTypeColor = (type: string) => {
    switch (type) {
      case 'BUY':
        return 'bg-blue-100 text-blue-800'
      case 'SELL':
        return 'bg-green-100 text-green-800'
      case 'DIVIDEND':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getTransactionTypeLabel = (type: string) => {
    switch (type) {
      case 'BUY':
        return '購入'
      case 'SELL':
        return '売却'
      case 'DIVIDEND':
        return '配当'
      default:
        return type
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">取引履歴</h1>
          <p className="text-muted-foreground">
            全取引の管理と分析
          </p>
        </div>
        <Button className="flex items-center space-x-2">
          <Plus className="h-4 w-4" />
          <span>新規取引追加</span>
        </Button>
      </div>

      {/* サマリーカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">総取引数</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {transactionsData.summary.totalTransactions}
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
              {formatCurrency(transactionsData.summary.totalBuyAmount)}
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
              {formatCurrency(transactionsData.summary.totalSellAmount)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">配当総額</CardTitle>
            <div className="text-yellow-600">配</div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(transactionsData.summary.totalDividend)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* フィルターとソート */}
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
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger>
                  <SelectValue placeholder="取引種別を選択" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全て</SelectItem>
                  <SelectItem value="BUY">購入</SelectItem>
                  <SelectItem value="SELL">売却</SelectItem>
                  <SelectItem value="DIVIDEND">配当</SelectItem>
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

      {/* 取引履歴テーブル */}
      <Card>
        <CardHeader>
          <CardTitle>取引履歴一覧</CardTitle>
          <p className="text-sm text-muted-foreground">
            {filteredAndSortedTransactions.length}件の取引
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredAndSortedTransactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center space-x-4">
                  <Badge className={getTransactionTypeColor(transaction.transactionType)}>
                    {getTransactionTypeLabel(transaction.transactionType)}
                  </Badge>
                  <div>
                    <div className="font-medium">{transaction.stockName}</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(transaction.transactionDate)}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="font-medium">
                    {formatCurrency(transaction.totalAmount)}
                  </div>
                  {transaction.shares > 0 && (
                    <div className="text-sm text-muted-foreground">
                      {transaction.shares}株 × {formatCurrency(transaction.pricePerShare)}
                    </div>
                  )}
                  {transaction.fee > 0 && (
                    <div className="text-xs text-muted-foreground">
                      手数料: {formatCurrency(transaction.fee)}
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

      {/* 期間別サマリー */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>今月のサマリー</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span>購入取引</span>
              <span className="font-medium">
                {transactionsData.summary.periodStats.thisMonth.buyCount}件
              </span>
            </div>
            <div className="flex justify-between">
              <span>売却取引</span>
              <span className="font-medium">
                {transactionsData.summary.periodStats.thisMonth.sellCount}件
              </span>
            </div>
            <div className="flex justify-between">
              <span>配当受取</span>
              <span className="font-medium">
                {transactionsData.summary.periodStats.thisMonth.dividendCount}件
              </span>
            </div>
            <div className="flex justify-between">
              <span>合計金額</span>
              <span className="font-medium">
                {formatCurrency(transactionsData.summary.periodStats.thisMonth.totalAmount)}
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
                {transactionsData.summary.periodStats.thisYear.buyCount}件
              </span>
            </div>
            <div className="flex justify-between">
              <span>売却取引</span>
              <span className="font-medium">
                {transactionsData.summary.periodStats.thisYear.sellCount}件
              </span>
            </div>
            <div className="flex justify-between">
              <span>配当受取</span>
              <span className="font-medium">
                {transactionsData.summary.periodStats.thisYear.dividendCount}件
              </span>
            </div>
            <div className="flex justify-between">
              <span>合計金額</span>
              <span className="font-medium">
                {formatCurrency(transactionsData.summary.periodStats.thisYear.totalAmount)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
