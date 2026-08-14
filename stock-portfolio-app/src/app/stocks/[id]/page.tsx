'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Edit,
  Plus,
  Minus,
  Coins,
  RefreshCw,
  TrendingUp,
  TrendingDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TransactionFormDialog } from '@/components/transactions/transaction-form-dialog'
import { DividendFormDialog } from '@/components/dividends/dividend-form-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatCurrency,
  formatMoney,
  formatPrice,
  formatPercentage,
  formatDate,
  formatDateTime,
  cn,
} from '@/lib/utils'
import { requestPriceUpdate } from '@/lib/price-update'

interface Transaction {
  id: number
  transactionType: 'BUY' | 'SELL'
  shares: number
  pricePerShare: number
  totalAmount: number
  fee: number
  transactionDate: string
  memo?: string
}

interface DividendHistory {
  id: number
  dividendAmount: number
  currency: string
  paymentDate: string
  dividendType: string | null
}

interface PriceHistory {
  id: number
  price: number
  recordedAt: string
  source: string
  marketSession?: string
}

interface StockDetail {
  id: number
  stockName: string
  holdingCompany: string
  market: string
  code: string
  sharesHeld: number
  avgAcquisitionPrice: number
  investmentAmount: number
  currentPrice: number
  profitLoss: number
  profitLossRate: number
  dividendPerShare: number
  dividendYield: number
  dividendAmount: number
  purchaseDate?: string
  saleDate?: string
  targetPrice?: number
  marketSector?: string
  purpose?: string
  lastPriceUpdate?: string
  priceUpdateStatus: string
  priceUpdateError?: string | null
  usdJpyRate?: number
  transactions: Transaction[]
  dividendHistory: DividendHistory[]
  priceHistory: PriceHistory[]
}

export default function StockDetailPage() {
  const params = useParams()
  const [stock, setStock] = useState<StockDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogType, setDialogType] = useState<'BUY' | 'SELL'>('BUY')
  const [dividendDialogOpen, setDividendDialogOpen] = useState(false)
  const [isUpdatingPrice, setIsUpdatingPrice] = useState(false)

  // 受取配当ダイアログに渡す銘柄候補。配列リテラルを毎レンダー生成すると
  // ダイアログ側の初期化 effect が再発火して入力が消えるため、銘柄が変わる時だけ作り直す。
  const dividendStockOptions = useMemo(
    () =>
      stock
        ? [
            {
              id: stock.id,
              stockName: stock.stockName,
              code: stock.code,
              market: stock.market,
              sharesHeld: stock.sharesHeld,
            },
          ]
        : [],
    [stock]
  )

  const fetchStock = useCallback(async () => {
    try {
      setLoading(true)
      if (params.id === 'new') {
        setLoading(false)
        return
      }
      const response = await fetch(`/api/stocks/${params.id}`)
      if (!response.ok) throw new Error('Failed to fetch stock')
      const result = await response.json()
      setStock(result.data)
    } catch (error) {
      console.error('Error fetching stock:', error)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  const handlePriceUpdate = async () => {
    if (!stock) return
    setIsUpdatingPrice(true)
    try {
      await requestPriceUpdate([stock.id])
      // 更新後の現在価格・損益・失敗理由を反映するため再取得する
      await fetchStock()
    } catch (error) {
      console.error('価格更新エラー:', error)
    } finally {
      setIsUpdatingPrice(false)
    }
  }

  useEffect(() => {
    if (params.id) fetchStock()
  }, [params.id, fetchStock])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button asChild variant="outline">
            <Link href="/holdings">
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Link>
          </Button>
        </div>
        <p>読み込み中...</p>
      </div>
    )
  }

  if (!stock) {
    // 新規作成ページの場合
    if (params.id === 'new') {
      return (
        <div className="space-y-6">
          <div className="flex items-center space-x-4">
            <Button asChild variant="outline">
              <Link href="/holdings">
                <ArrowLeft className="h-4 w-4 mr-2" />
                戻る
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">新規銘柄登録</h1>
          </div>
          <p className="text-muted-foreground">
            新規銘柄登録機能は現在開発中です。
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Button asChild variant="outline">
            <Link href="/holdings">
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Link>
          </Button>
        </div>
        <p>銘柄が見つかりません。</p>
      </div>
    )
  }

  const profitLossColor =
    stock.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'
  const isProfit = stock.profitLoss >= 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button asChild variant="outline">
            <Link href="/holdings">
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{stock.stockName}</h1>
              {stock.priceUpdateStatus === 'ERROR' && (
                <Badge
                  variant="destructive"
                  title={stock.priceUpdateError ?? '価格取得に失敗しました'}
                >
                  価格更新失敗
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {stock.code} | {stock.market} | {stock.holdingCompany}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={() => {
              setDialogType('BUY')
              setDialogOpen(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            購入を追加
          </Button>
          <Button
            variant="outline"
            disabled={stock.sharesHeld <= 0}
            onClick={() => {
              setDialogType('SELL')
              setDialogOpen(true)
            }}
          >
            <Minus className="h-4 w-4 mr-2" />
            売却
          </Button>
          <Button variant="outline" onClick={() => setDividendDialogOpen(true)}>
            <Coins className="h-4 w-4 mr-2" />
            受取配当を追加
          </Button>
          <Button
            variant="outline"
            onClick={handlePriceUpdate}
            disabled={isUpdatingPrice}
          >
            <RefreshCw
              className={cn('h-4 w-4 mr-2', isUpdatingPrice && 'animate-spin')}
            />
            {isUpdatingPrice ? '更新中...' : '価格更新'}
          </Button>
          <Button asChild>
            <Link href={`/stocks/${stock.id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              編集
            </Link>
          </Button>
        </div>
      </div>

      <TransactionFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        stocks={[
          {
            id: stock.id,
            stockName: stock.stockName,
            code: stock.code,
            sharesHeld: stock.sharesHeld,
          },
        ]}
        defaultStockId={stock.id}
        defaultType={dialogType}
        onSubmitted={() => fetchStock()}
      />

      <DividendFormDialog
        open={dividendDialogOpen}
        onOpenChange={setDividendDialogOpen}
        stocks={dividendStockOptions}
        defaultStockId={stock.id}
        onSubmitted={() => fetchStock()}
      />

      {/* 基本情報カード */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>投資情報</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">保有株数</p>
                <p className="text-2xl font-bold">
                  {stock.sharesHeld.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">平均取得単価</p>
                <p className="text-2xl font-bold">
                  {formatPrice(stock.avgAcquisitionPrice, stock.market)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  投資額{stock.market === '米国' && '（円換算）'}
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(stock.investmentAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">現在価格</p>
                <p className="text-2xl font-bold">
                  {formatPrice(stock.currentPrice, stock.market)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              損益情報
              {isProfit ? (
                <TrendingUp className={`h-4 w-4 ml-2 ${profitLossColor}`} />
              ) : (
                <TrendingDown className={`h-4 w-4 ml-2 ${profitLossColor}`} />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">
                  評価損益{stock.market === '米国' && '（円換算）'}
                </p>
                <p className={`text-2xl font-bold ${profitLossColor}`}>
                  {formatCurrency(stock.profitLoss)}
                </p>
                {stock.market === '米国' && stock.usdJpyRate && (
                  <p className="text-xs text-muted-foreground">
                    ＄1 ≈ ¥{stock.usdJpyRate.toFixed(2)} 換算
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">評価損益率</p>
                <p className={`text-2xl font-bold ${profitLossColor}`}>
                  {formatPercentage(stock.profitLossRate)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">
                  配当利回り（予想）
                </p>
                <p className="text-2xl font-bold">
                  {formatPercentage(stock.dividendYield)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">予想年間配当</p>
                <p className="text-2xl font-bold">
                  {formatPrice(stock.dividendAmount, stock.market)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 詳細情報 */}
      <Card>
        <CardHeader>
          <CardTitle>詳細情報</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stock.purchaseDate && (
              <div>
                <p className="text-sm text-muted-foreground">購入日</p>
                <p className="font-medium">{formatDate(stock.purchaseDate)}</p>
              </div>
            )}
            {stock.saleDate && (
              <div>
                <p className="text-sm text-muted-foreground">売却日</p>
                <p className="font-medium">{formatDate(stock.saleDate)}</p>
              </div>
            )}
            {stock.targetPrice && (
              <div>
                <p className="text-sm text-muted-foreground">目標価格</p>
                <p className="font-medium">
                  {formatPrice(stock.targetPrice, stock.market)}
                </p>
              </div>
            )}
            {stock.marketSector && (
              <div>
                <p className="text-sm text-muted-foreground">セクター</p>
                <p className="font-medium">{stock.marketSector}</p>
              </div>
            )}
            {stock.purpose && (
              <div>
                <p className="text-sm text-muted-foreground">投資目的</p>
                <p className="font-medium">{stock.purpose}</p>
              </div>
            )}
            {stock.lastPriceUpdate && (
              <div>
                <p className="text-sm text-muted-foreground">最終価格更新</p>
                <p className="font-medium">
                  {formatDateTime(stock.lastPriceUpdate)}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 取引履歴 */}
      <Card>
        <CardHeader>
          <CardTitle>取引履歴 ({stock.transactions.length}件)</CardTitle>
        </CardHeader>
        <CardContent>
          {stock.transactions.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>取引種別</TableHead>
                  <TableHead className="text-right">株数</TableHead>
                  <TableHead className="text-right">単価</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead className="text-right">手数料</TableHead>
                  <TableHead>取引日</TableHead>
                  <TableHead>メモ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          transaction.transactionType === 'BUY'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {transaction.transactionType === 'BUY'
                          ? '購入'
                          : '売却'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {transaction.shares.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(transaction.pricePerShare, stock.market)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(transaction.totalAmount, stock.market)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(transaction.fee, stock.market)}
                    </TableCell>
                    <TableCell>
                      {formatDate(transaction.transactionDate)}
                    </TableCell>
                    <TableCell>{transaction.memo || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">取引履歴がありません。</p>
          )}
        </CardContent>
      </Card>

      {/* 受取配当履歴 */}
      {stock.dividendHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              受取配当履歴 ({stock.dividendHistory.length}件)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>配当種別</TableHead>
                  <TableHead className="text-right">受取金額</TableHead>
                  <TableHead>支払日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stock.dividendHistory.map((dividend) => (
                  <TableRow key={dividend.id}>
                    <TableCell>{dividend.dividendType ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {formatMoney(dividend.dividendAmount, dividend.currency)}
                    </TableCell>
                    <TableCell>{formatDate(dividend.paymentDate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
