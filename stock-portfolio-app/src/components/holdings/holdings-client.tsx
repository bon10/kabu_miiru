'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Building2,
  Coins,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import {
  cn,
  formatCurrency,
  formatPrice,
  formatPercentage,
  formatAvgAcquisitionPrice,
  AVG_ACQUISITION_PRICE_NOTE,
} from '@/lib/utils'
import { requestPriceUpdate } from '@/lib/price-update'
import { NewStockDialog } from '@/components/stocks/new-stock-dialog'

// 保有一覧ページ。ユビキタス言語: docs/2-domain/ubiquitous-language.md
//   - デフォルトは「保有」(sharesHeld > 0) のみ表示。
//   - includeZero トグルで過去に保有していた銘柄も表示（銘柄マスタ全体を確認したい時用）。
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
  priceUpdateStatus: string
  priceUpdateError: string | null
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

// 銘柄名セル。フラット表示・証券会社別表示で共通。
//   - 直近の価格更新が失敗した銘柄には「価格更新失敗」バッジを出し、
//     マウスオーバーで priceUpdateError（失敗理由）を表示する。
//   - 行ごとに個別の価格更新ボタンを持ち、その銘柄だけ再取得できる。
//     完了後は onUpdated で一覧全体を再取得してバッジ・価格を反映する。
function StockNameCell({
  holding,
  onUpdated,
}: {
  holding: HoldingRow
  onUpdated: () => void
}) {
  const [isUpdating, setIsUpdating] = useState(false)

  const handleUpdate = async () => {
    setIsUpdating(true)
    try {
      await requestPriceUpdate([holding.id])
      onUpdated()
    } catch (error) {
      console.error('価格更新エラー:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <TableCell>
      <div className="flex items-center gap-2">
        <Link
          href={`/stocks/${holding.id}`}
          className="font-medium hover:underline"
        >
          {holding.stockName}
        </Link>
        {holding.priceUpdateStatus === 'ERROR' && (
          <Badge
            variant="destructive"
            title={holding.priceUpdateError ?? '価格取得に失敗しました'}
          >
            価格更新失敗
          </Badge>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={handleUpdate}
          disabled={isUpdating}
          title="この銘柄の価格を更新"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', isUpdating && 'animate-spin')}
          />
        </Button>
      </div>
      <div className="text-xs text-muted-foreground">{holding.code}</div>
    </TableCell>
  )
}

type ViewMode = 'by-broker' | 'flat'

export default function HoldingsClient() {
  const [viewMode, setViewMode] = useState<ViewMode>('by-broker')
  const [includeZero, setIncludeZero] = useState(false)
  const [newStockOpen, setNewStockOpen] = useState(false)

  const { data, isLoading, mutate } = useSWR<ApiResponse>(
    `/api/holdings/by-broker?includeZero=${includeZero}`,
    fetcher
  )

  const grand = data?.data.grandTotal

  const brokers = useMemo(() => data?.data.brokers ?? [], [data])

  // フラット表示のために全証券会社の holdings を平坦化してソート
  const flatRows = useMemo(() => {
    return brokers
      .flatMap((b) =>
        b.holdings.map((h) => ({ ...h, brokerName: b.brokerName }))
      )
      .sort((a, b) => b.investmentAmount - a.investmentAmount)
  }, [brokers])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">保有一覧</h1>
          <p className="text-muted-foreground">
            銘柄マスタと現状の保有・損益を一覧できます。
            {includeZero ? '（過去保有含む）' : '（現保有のみ）'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={includeZero}
              onChange={(e) => setIncludeZero(e.target.checked)}
              className="rounded"
            />
            保有0の銘柄も表示
          </label>
          <Select
            value={viewMode}
            onValueChange={(v) => setViewMode(v as ViewMode)}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="by-broker">証券会社別</SelectItem>
              <SelectItem value="flat">フラット</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setNewStockOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            新規銘柄登録
          </Button>
        </div>
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
              {grand?.totalStocks ?? '-'}銘柄
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">投資額</CardTitle>
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
            該当する銘柄がありません。
          </CardContent>
        </Card>
      ) : viewMode === 'flat' ? (
        <Card>
          <CardHeader>
            <CardTitle>銘柄一覧（{flatRows.length}件）</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>銘柄</TableHead>
                  <TableHead>証券会社</TableHead>
                  <TableHead>市場</TableHead>
                  <TableHead className="text-right">保有株数</TableHead>
                  <TableHead className="text-right">
                    <span
                      className="cursor-help underline decoration-dotted underline-offset-4"
                      title={AVG_ACQUISITION_PRICE_NOTE}
                    >
                      平均取得
                    </span>
                  </TableHead>
                  <TableHead className="text-right">現在価格</TableHead>
                  <TableHead className="text-right">投資額</TableHead>
                  <TableHead className="text-right">評価額</TableHead>
                  <TableHead className="text-right">評価損益</TableHead>
                  <TableHead className="text-right">今年の配当</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatRows.map((h) => (
                  <TableRow key={h.id}>
                    <StockNameCell holding={h} onUpdated={mutate} />
                    <TableCell>{h.brokerName}</TableCell>
                    <TableCell>{h.market}</TableCell>
                    <TableCell className="text-right">{h.sharesHeld}</TableCell>
                    <TableCell className="text-right">
                      {formatAvgAcquisitionPrice(h.avgAcquisitionPrice, h.market)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatPrice(h.currentPrice, h.market)}
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
                      {h.ytdDividend > 0 ? formatCurrency(h.ytdDividend) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                    <TableHead className="text-right">
                      <span
                        className="cursor-help underline decoration-dotted underline-offset-4"
                        title={AVG_ACQUISITION_PRICE_NOTE}
                      >
                        平均取得
                      </span>
                    </TableHead>
                    <TableHead className="text-right">現在価格</TableHead>
                    <TableHead className="text-right">投資額</TableHead>
                    <TableHead className="text-right">評価額</TableHead>
                    <TableHead className="text-right">評価損益</TableHead>
                    <TableHead className="text-right">今年の配当</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {broker.holdings.map((h) => (
                    <TableRow key={h.id}>
                      <StockNameCell holding={h} onUpdated={mutate} />
                      <TableCell>{h.market}</TableCell>
                      <TableCell className="text-right">
                        {h.sharesHeld}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatAvgAcquisitionPrice(h.avgAcquisitionPrice, h.market)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatPrice(h.currentPrice, h.market)}
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

      <NewStockDialog
        open={newStockOpen}
        onOpenChange={setNewStockOpen}
        onSubmitted={() => mutate()}
      />
    </div>
  )
}
