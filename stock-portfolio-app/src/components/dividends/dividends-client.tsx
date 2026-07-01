'use client'

import { useMemo, useState } from 'react'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Coins, Plus, Trash2 } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import {
  DividendFormDialog,
  type DividendStockOption,
} from '@/components/dividends/dividend-form-dialog'

interface DividendRow {
  id: number
  stockId: number
  stockName: string
  stockCode: string
  holdingCompany: string
  dividendAmount: number
  paymentDate: string
  dividendType: string
}

interface DividendsResponse {
  data: {
    dividends: DividendRow[]
  }
}

interface SummaryResponse {
  data: {
    year: number
    yearTotal: number
    firstHalfTotal: number
    secondHalfTotal: number
    prevYearTotal: number
    yearOverYearDiff: number
    count: number
    byStock: Array<{
      stockId: number
      stockName: string
      stockCode: string
      holdingCompany: string
      total: number
      firstHalf: number
      secondHalf: number
      count: number
    }>
  }
}

interface StocksResponse {
  data: {
    stocks: Array<{ id: number; stockName: string; code: string }>
  }
}

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error('fetch failed')
  return res.json()
}

export default function DividendsClient() {
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: divData, mutate: mutateDiv } = useSWR<DividendsResponse>(
    `/api/dividends?year=${selectedYear}&limit=500`,
    fetcher
  )
  const { data: sumData, mutate: mutateSum } = useSWR<SummaryResponse>(
    `/api/dividends/summary?year=${selectedYear}`,
    fetcher
  )
  const { data: stocksData } = useSWR<StocksResponse>(
    '/api/stocks?includeZero=true',
    fetcher
  )

  const dividends = divData?.data.dividends ?? []
  const summary = sumData?.data
  const stocks: DividendStockOption[] = useMemo(
    () =>
      (stocksData?.data.stocks ?? []).map((s) => ({
        id: s.id,
        stockName: s.stockName,
        code: s.code,
      })),
    [stocksData]
  )

  const yearOptions = useMemo(() => {
    const ys: number[] = []
    for (let y = currentYear; y >= currentYear - 5; y--) ys.push(y)
    return ys
  }, [currentYear])

  async function handleDelete(id: number) {
    if (!confirm('この配当を削除しますか？')) return
    const res = await fetch(`/api/dividends/${id}`, { method: 'DELETE' })
    if (res.ok) {
      mutateDiv()
      mutateSum()
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">配当（受取）管理</h1>
          <p className="text-muted-foreground">
            実際に受け取った配当金の記録。年・半期はカレンダー年基準（ADR
            0004）。
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => setSelectedYear(Number(v))}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}年
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => setDialogOpen(true)}
            className="flex items-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>受取配当を追加</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {selectedYear}年 合計
            </CardTitle>
            <Coins className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCurrency(summary.yearTotal) : '-'}
            </div>
            {summary && (
              <p className="text-xs text-muted-foreground mt-1">
                前年比 {summary.yearOverYearDiff >= 0 ? '+' : ''}
                {formatCurrency(summary.yearOverYearDiff)}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              上半期 (1-6月)
            </CardTitle>
            <span className="text-xs text-muted-foreground">H1</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCurrency(summary.firstHalfTotal) : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              下半期 (7-12月)
            </CardTitle>
            <span className="text-xs text-muted-foreground">H2</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary ? formatCurrency(summary.secondHalfTotal) : '-'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">受取件数</CardTitle>
            <span className="text-xs text-muted-foreground">件</span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.count ?? '-'}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>銘柄別 {selectedYear}年配当</CardTitle>
        </CardHeader>
        <CardContent>
          {summary && summary.byStock.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>銘柄</TableHead>
                  <TableHead>証券会社</TableHead>
                  <TableHead className="text-right">上半期</TableHead>
                  <TableHead className="text-right">下半期</TableHead>
                  <TableHead className="text-right">年計</TableHead>
                  <TableHead className="text-right">件数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byStock.map((s) => (
                  <TableRow key={s.stockId}>
                    <TableCell>
                      <div className="font-medium">{s.stockName}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.stockCode}
                      </div>
                    </TableCell>
                    <TableCell>{s.holdingCompany}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(s.firstHalf)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(s.secondHalf)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(s.total)}
                    </TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">
              この年の配当受取記録はありません。
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>受取履歴 ({dividends.length}件)</CardTitle>
        </CardHeader>
        <CardContent>
          {dividends.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>支払日</TableHead>
                  <TableHead>銘柄</TableHead>
                  <TableHead>証券会社</TableHead>
                  <TableHead>種別</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dividends.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{formatDate(d.paymentDate)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{d.stockName}</div>
                      <div className="text-xs text-muted-foreground">
                        {d.stockCode}
                      </div>
                    </TableCell>
                    <TableCell>{d.holdingCompany}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.dividendType}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(d.dividendAmount)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(d.id)}
                        aria-label="削除"
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">
              この年の受取履歴はありません。
            </p>
          )}
        </CardContent>
      </Card>

      <DividendFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        stocks={stocks}
        onSubmitted={() => {
          mutateDiv()
          mutateSum()
        }}
      />
    </div>
  )
}
